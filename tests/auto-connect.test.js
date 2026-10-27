import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticProfile,discoverConnection} from '../auto-connect.js';
import {endpoint} from '../relay.js';
test('known sites require only URLs, with native NAI and LLM paths chosen automatically',()=>{
 for(const [url,kind,expected] of [
  ['https://tang.iisbo.com/novelai','image','https://tang.iisbo.com/novelai/ai/generate-image'],
  ['https://tang.iisbo.com','image','https://tang.iisbo.com/novelai/ai/generate-image'],
  ['https://api.rinko.ai/nai','image','https://api.rinko.ai/nai/ai/generate-image'],
  ['https://api.rinko.ai','image','https://api.rinko.ai/nai/ai/generate-image'],
  ['https://ynai.rinko.ai','image','https://ynai.rinko.ai/v1/nai/generate-image'],
  ['https://nai.rinko.ai','image','https://nai.rinko.ai/v1/nai/generate-image'],
  ['https://api.rinko.ai','prompt','https://api.rinko.ai/v1/chat/completions'],
  ['https://gcli.ggchan.dev','chat','https://gcli.ggchan.dev/v1/chat/completions']
 ]){const profile=automaticProfile(url,kind);assert.equal(profile.known,true);assert.equal(endpoint(profile.settings,kind==='image'?'image':'text'),expected);}
 assert.equal(automaticProfile('https://nai.rinko.ai.attacker.test','image').known,false);
 assert.throws(()=>automaticProfile('https://secret@api.rinko.ai','prompt'));
});
test('model metadata selects different protocols without making generation requests',async()=>{
 const calls=[];
 const result=await discoverConnection('https://api.rinko.ai/v1','prompt',async candidate=>{calls.push(endpoint(candidate,'models'));return {data:[{id:'legacy',supported_endpoint_types:['openai']},{id:'new',supported_endpoint_types:['openai-response']}]};});
 assert.deepEqual(calls,['https://api.rinko.ai/v1/models']);
 assert.equal(result.configurations.legacy.textProtocol,'chat');assert.equal(result.configurations.new.textProtocol,'responses');
 const images=await discoverConnection('https://relay.test','image',async()=>({data:[{id:'chat-image',supported_endpoint_types:['openai'],architecture:{output_modalities:['image','text']}},{id:'regular',supported_endpoint_types:['image-generation']}]}));
 assert.equal(images.configurations['chat-image'].imageProtocol,'chat');assert.equal(images.configurations.regular.imageProtocol,'images');
});
test('discovery tries bounded same-origin model-list paths and preserves root-based endpoints',async()=>{
 const calls=[];
 const result=await discoverConnection('https://relay.test','prompt',async candidate=>{
  const url=endpoint(candidate,'models');calls.push(url);if(url.endsWith('/v1/models'))throw Object.assign(Error('404'),{status:404});return {data:[{id:'root-model',supported_endpoint_types:['responses']}]};
 });
 assert.deepEqual(calls,['https://relay.test/v1/models','https://relay.test/models']);
 assert.equal(endpoint(result.configurations['root-model'],'text'),'https://relay.test/responses');
 assert.equal(endpoint(result.configurations['root-model'],'models'),'https://relay.test/models');
});
test('auth, permission and rate-limit errors never trigger alternate requests or reference success',async()=>{
 for(const status of [401,403,429]){
  let calls=0;await assert.rejects(discoverConnection('https://tang.iisbo.com','image',async()=>{calls++;throw Object.assign(Error('failed'),{status});}),/failed/);assert.equal(calls,1);
 }
});
test('NAI reference models are explicitly unverified when discovery is unavailable',async()=>{
 const result=await discoverConnection('https://tang.iisbo.com/novelai','image',async()=>{throw Object.assign(Error('not supported'),{status:405});});
 assert.equal(result.verified,false);assert.ok(result.models.includes('nai-diffusion-4-5-full'));assert.equal(result.configurations[result.models[0]].imageProtocol,'novelai');
 await assert.rejects(discoverConnection('https://tang.iisbo.com','image',async()=>{throw Error('network unavailable');}),/network unavailable/);
});
test('unknown sites fail explicitly after at most three probes and abort stops discovery',async()=>{
 let calls=0;await assert.rejects(discoverConnection('https://relay.test','chat',async()=>{calls++;throw Error('unavailable');}),/unavailable/);assert.equal(calls,3);
 const controller=new AbortController();controller.abort();calls=0;
 await assert.rejects(discoverConnection('https://relay.test','image',async()=>{calls++;return [];},controller.signal),{name:'AbortError'});assert.equal(calls,0);
});
