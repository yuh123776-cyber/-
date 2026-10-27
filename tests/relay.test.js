import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import * as R from '../relay.js';
import {novelAIRequest,novelAIBlob} from '../novelai.js';
import {zipImage,crc32} from '../zip-image.js';
import {complete,setKey} from '../api.js';
import {relayPresets} from '../relay-presets.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64');
function zip(method=8){
 const name=Buffer.from('image_0.png'),data=method===8?deflateRawSync(png):png,crc=crc32(png),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(method,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(png.length,22);local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(method,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(png.length,24);central.writeUInt16LE(name.length,28);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+data.length,16);
 return new Uint8Array(Buffer.concat([local,name,data,central,name,end]));
}
test('relay URL normalization preserves prefixes, custom paths and NAI complete endpoints',()=>{
 for(const url of ['https://proxy.test','https://proxy.test/',' https://proxy.test/v1/// ','https://proxy.test/v1/chat/completions','https://proxy.test/v1/images/generations','https://proxy.test/v1/responses'])assert.equal(R.endpoint({url},'models'),'https://proxy.test/v1/models');
 assert.equal(R.endpoint({url:'https://proxy.test/api/v1'},'text'),'https://proxy.test/api/v1/chat/completions');
 assert.equal(R.endpoint({url:'https://proxy.test/v1',requestPath:'/custom/images'},'image'),'https://proxy.test/custom/images');
 assert.equal(R.endpoint({url:'https://proxy.test/api/v1',requestPath:'images'},'image'),'https://proxy.test/api/v1/images');
 assert.equal(R.endpoint({url:'https://tang.iisbo.com/novelai',imageProtocol:'novelai'},'image'),'https://tang.iisbo.com/novelai/ai/generate-image');
 assert.equal(R.endpoint({url:'https://proxy.test',imageProtocol:'novelai'},'image'),'https://proxy.test/ai/generate-image');
 assert.equal(R.endpoint({url:'https://proxy.test/ai/generate-image',imageProtocol:'novelai'},'image'),'https://proxy.test/ai/generate-image');
 for(const requestPath of ['https://other.test/generate','//other.test/a','../models','%2e%2e/models','models?key=secret'])assert.throws(()=>R.endpoint({url:'https://proxy.test/v1',requestPath},'text'));
 for(const url of ['https://key@proxy.test','https://proxy.test?key=x','file:///tmp'])assert.throws(()=>R.apiBase(url));
});
test('relay model wrappers and multipart text are normalized without filtering model aliases',()=>{
 assert.deepEqual(R.modelIds({data:{models:[{name:'nai-diffusion-4-5-full'},{model:'custom/alias'},{id:'exact',name:'Display Name'},null]}}),['custom/alias','exact','nai-diffusion-4-5-full']);
 assert.equal(R.textContent({choices:[{message:{content:[{type:'text',text:'part1'},{type:'text',text:'part2'}]}}]}),'part1part2');
 assert.equal(R.textContent({output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:'answer'}]}]}),'answer');
 assert.throws(()=>R.textContent({choices:[{message:{refusal:'refused'}}]}),/没有返回文本/);
});
test('text relay requests use the chosen protocol, authentication and safe additional parameters',async()=>{
 const old=globalThis.fetch,calls=[];setKey('prompt','prompt-secret');
 globalThis.fetch=async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return Response.json({output:[{type:'message',content:[{type:'output_text',text:'{"positive":"flower","negative":"blur"}'}]}]});};
 try{
  const result=await complete({mode:'openai',url:'https://proxy.test',textProtocol:'responses',apiAuth:'x-api-key',template:'template',instructions:'instructions',extraParams:'{"max_output_tokens":512}'},'prompt',[{role:'user',content:'brief'}]);
  assert.ok(result.includes('flower'));assert.equal(calls[0].url,'https://proxy.test/v1/responses');assert.equal(calls[0].options.headers['x-api-key'],'prompt-secret');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].body.instructions,'template\n\ninstructions');assert.equal(calls[0].body.max_output_tokens,512);assert.equal(calls[0].body.stream,false);
  for(const extra of ['[]','{"headers":{"Authorization":"secret"}}','{"provider":{"api_key":"secret"}}','{"model":"override"}','{"stream":true}'])assert.throws(()=>R.extraParams(extra));
 }finally{globalThis.fetch=old;setKey('prompt','');}
});
test('standard and chat image requests do not force unsupported image parameters',()=>{
 const body=R.imageRequest({model:'image',imageSizeMode:'default',extraParams:'{"aspect_ratio":"3:4","quality":"high"}'},'prompt');
 assert.equal(body.size,undefined);assert.equal(body.response_format,undefined);assert.equal(body.n,1);assert.equal(body.quality,'high');
 const chat=R.imageRequest({model:'chat-image',imageProtocol:'chat',imageModalities:'image'},'prompt');
 assert.deepEqual(chat.modalities,['image']);assert.equal(chat.messages[0].content,'prompt');assert.equal(chat.prompt,undefined);assert.equal(chat.stream,false);
});
test('NAI separates negative prompt, maps v3/v4/v5 parameters and protects one-sample generation',()=>{
 const settings={model:'nai-diffusion-4-5-full',width:832,height:1216,steps:28,cfg:5,extraParams:'{"parameters":{"cfg_rescale":0.2}}'},v={seed:123,negative:'blur'};
 let body=novelAIRequest(settings,v,'positive');assert.equal(body.input,'positive');assert.equal(body.parameters.negative_prompt,'blur');assert.equal(body.parameters.seed,123);assert.equal(body.parameters.scale,5);assert.equal(body.parameters.n_samples,1);assert.equal(body.parameters.v4_prompt.caption.base_caption,'positive');assert.equal(body.parameters.v4_negative_prompt.caption.base_caption,'blur');assert.equal(body.parameters.params_version,3);assert.equal(body.parameters.cfg_rescale,0.2);
 body=novelAIRequest({...settings,model:'nai-diffusion-5-full'},v,'positive');assert.equal(body.parameters.params_version,4);
 body=novelAIRequest({...settings,model:'nai-diffusion-3'},v,'positive');assert.equal(body.parameters.v4_prompt,undefined);
 assert.throws(()=>novelAIRequest({...settings,width:833},v,'positive'),/64/);
 assert.throws(()=>novelAIRequest({...settings,extraParams:'{"parameters":{"n_samples":8}}'},v,'positive'),/不能覆盖/);
});
test('NAI ZIP stored and deflated images preserve bytes, CRC rejects damage and abort is honored',async()=>{
 for(const method of [0,8]){const blob=await zipImage(zip(method));assert.equal(blob.type,'image/png');assert.deepEqual(Buffer.from(await blob.arrayBuffer()),png);}
 const bad=zip(0);bad[42]^=1;await assert.rejects(zipImage(bad),/ZIP/);
 await assert.rejects(zipImage(new Uint8Array([0,1])),/ZIP/);
 const c=new AbortController();c.abort();await assert.rejects(zipImage(zip(),c.signal),{name:'AbortError'});
});
test('NAI binary and JSON images and chat data URLs are accepted, image downloads omit credentials',async()=>{
 const old=globalThis.fetch;
 try{
  for(const payload of [zip(),png]){
   globalThis.fetch=async()=>new Response(payload);
   const blob=await novelAIBlob('https://proxy.test/novelai',{},'secret',{},undefined);assert.deepEqual(Buffer.from(await blob.arrayBuffer()),png);
  }
  for(const data of [{images:[{image:png.toString('base64')}]},{choices:[{message:{images:[{image_url:{url:'data:image/png;base64,'+png.toString('base64')}}]}}]},{choices:[{message:{content:'![result](data:image/png;base64,'+png.toString('base64')+')'}}]}])assert.deepEqual(Buffer.from(await (await R.imageBlob(data,'https://proxy.test/ai/generate-image')).arrayBuffer()),png);
  globalThis.fetch=async(url,options)=>{assert.equal(url.href,'https://proxy.test/image.png');assert.equal(options.headers,undefined);assert.equal(options.credentials,'omit');return new Response(png,{headers:{'Content-Type':'image/png'}});};
  await R.imageBlob({data:[{url:'/image.png'}]},'https://proxy.test/v1/images/generations');
  await assert.rejects(R.imageBlob({data:[{url:'file:///tmp'}]},'https://proxy.test'),/不支持/);
 }finally{globalThis.fetch=old;}
});
test('station presets map to explicit protocols and HTTP failure never retries a generation',async()=>{
 const tang=relayPresets['tang-nai'].values;assert.equal(R.endpoint(tang,'image'),'https://tang.iisbo.com/novelai/ai/generate-image');assert.equal(R.endpoint(tang,'models'),'https://tang.iisbo.com/v1/models');
 assert.equal(R.endpoint(relayPresets['rinko-nai'].values,'image'),'https://api.rinko.ai/nai/ai/generate-image');
 for(const id of ['ynai-rinko','nai-rinko'])assert.equal(new URL(R.endpoint(relayPresets[id].values,'image')).pathname,'/v1/nai/generate-image');
 assert.equal(R.endpoint(relayPresets.rinko.values,'text'),'https://api.rinko.ai/v1/chat/completions');assert.equal(R.endpoint(relayPresets.gcli.values,'text'),'https://gcli.ggchan.dev/v1/chat/completions');
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('secret',{status:429});};
 try{await assert.rejects(R.requestJSON('https://proxy.test/v1/chat/completions',{method:'POST'}),/HTTP 429/);assert.equal(calls,1);}finally{globalThis.fetch=old;}
});
