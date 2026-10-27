import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {png,imageZip} from './image-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.resolve(process.env.HUIYUE_TEST_ROOT||'.'),version='1.3.1',calls=[],errors=[];
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='huiyue.test'){
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script type="module" src="/loader-v1.3.1.js"></script>'});
   const file=path.resolve(root,url.pathname.slice(1));if(!file.startsWith(root+path.sep))return route.abort();
   return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/css',body:await fs.readFile(file)});
  }
  const body=route.request().postDataJSON(),entry={url:url.href,path:url.pathname,headers:route.request().headers(),body};calls.push(entry);
  const json=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.endsWith('/models'))return json({data:{models:[{id:'nai-diffusion-4-5-full'},{name:'relay-text-model'}]}});
  if(url.pathname.endsWith('/chat/completions')){
   if(body.model==='chat-image')return json({choices:[{message:{content:[{type:'image_url',image_url:{url:'data:image/png;base64,'+png.toString('base64')}}]}}]});
   return json({choices:[{message:{content:[{type:'text',text:'{"positive":"garden portrait","negative":"blur"}'}]}}]});
  }
  if(url.pathname.endsWith('/responses'))return json({output:[{type:'message',content:[{type:'output_text',text:'response-text'}]}]});
  if(url.pathname.endsWith('/images/generations'))return json({data:[{b64_json:png.toString('base64')}]});
  if(url.pathname.endsWith('/generate-image'))return url.hostname==='nai.rinko.ai'||url.hostname==='ynai.rinko.ai'?json({images:[png.toString('base64')],image_format:'png'}):route.fulfill({contentType:'application/zip',body:imageZip()});
  return route.fulfill({status:404,body:'Unexpected mock endpoint'});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const open=async()=>{await page.waitForFunction(()=>globalThis.Huiyue);await page.evaluate(()=>Huiyue.open());await page.locator('[data-act="nav"][data-id="me"]').click();await page.locator('[data-act="settings"]').click();};
 const state=()=>page.evaluate(async()=>{const S=await import('/storage.js?v=1.3.1');return S.loadWorld(localStorage.getItem('huiyue-world'));});
 const save=async(expected)=>{
  await page.locator('[data-form=settings] > button[type=submit]').click();
  await page.waitForFunction(async expected=>{const S=await import('/storage.js?v=1.3.1'),w=await S.loadWorld(localStorage.getItem('huiyue-world'));return Object.entries(expected).every(([key,value])=>key.split('.').reduce((o,k)=>o?.[k],w.settings)===value);},expected);
  await page.waitForFunction(()=>document.querySelector('[name="image.key"]')?.value==='');
 };
 await page.goto('http://huiyue.test/');await open();
 for(const [kind,url] of [['chat','https://api.rinko.ai'],['prompt','https://gcli.ggchan.dev']]){
  const box=page.locator(`[data-api-kind="${kind}"]`);const before=calls.length;
  await box.locator(`[name="${kind}.url"]`).fill(url);assert.equal(calls.length,before);
  await box.locator(`[name="${kind}.key"]`).fill('test-'+kind);
  await box.locator('[data-fetch-models]').click();await box.locator('[data-model-status]').filter({hasText:'读取到'}).waitFor();
  await box.locator('[data-model-list]').selectOption('relay-text-model');
 }
 for(const [url,expected] of [['https://tang.iisbo.com/novelai','https://tang.iisbo.com/novelai/ai/generate-image'],['https://api.rinko.ai/nai','https://api.rinko.ai/nai/ai/generate-image'],['https://ynai.rinko.ai/','https://ynai.rinko.ai/v1/nai/generate-image'],['https://nai.rinko.ai/','https://nai.rinko.ai/v1/nai/generate-image']]){
  const box=page.locator('[data-api-kind="image"]'),before=calls.length;
  await box.locator('[name="image.url"]').fill(url);assert.equal(calls.length,before);
  await box.locator('[name="image.key"]').fill('test-image');
  await box.locator('[data-fetch-models]').click();await box.locator('[data-model-status]').filter({hasText:'读取到'}).waitFor();
  assert.ok(calls.at(-1).url.endsWith('/v1/models'));
  await box.locator('[data-model-list]').selectOption('nai-diffusion-4-5-full');
  await save({'image.url':new URL(expected).origin+(url.includes('/novelai')?'/novelai':url.includes('/nai')&&new URL(url).hostname==='api.rinko.ai'?'/nai':''),'image.imageProtocol':'novelai'});
  const image=await page.evaluate(async()=>{
   const A=await import('/api.js?v=1.3.1'),S=await import('/storage.js?v=1.3.1'),w=await S.loadWorld(localStorage.getItem('huiyue-world'));
   const result=await A.draw(w.settings.image,{positive:'flower',negative:'blur',seed:123,stage:'草稿',number:1});const asset=await S.getAsset(result.asset);return {bytes:[...new Uint8Array(await asset.blob.arrayBuffer())],params:result.params};
  });
  assert.equal(calls.at(-1).url,expected);assert.equal(calls.at(-1).body.parameters.n_samples,1);assert.equal(calls.at(-1).body.parameters.seed,123);assert.equal(calls.at(-1).body.parameters.negative_prompt,'blur');assert.deepEqual(Buffer.from(image.bytes),png);assert.ok(!JSON.stringify(image.params).includes('test-image'));
 }
 const text=await page.evaluate(async()=>{const A=await import('/api.js?v=1.3.1'),S=await import('/storage.js?v=1.3.1'),w=await S.loadWorld(localStorage.getItem('huiyue-world'));return {prompt:await A.complete(w.settings.prompt,'prompt',[{role:'user',content:'brief'}]),chat:await A.complete({...w.settings.chat,textProtocol:'responses'},'chat',[{role:'user',content:'hello'}])};});
 assert.ok(text.prompt.includes('garden'));assert.equal(text.chat,'response-text');assert.equal(calls.at(-1).headers.authorization,'Bearer test-chat');assert.equal(calls.at(-2).headers.authorization,'Bearer test-prompt');
 // Real UI prompt -> native image -> stored original pipeline using the saved station settings.
 const orderId=await page.evaluate(async()=>{const C=await import('/core.js?v=1.3.1'),S=await import('/storage.js?v=1.3.1'),w=await S.loadWorld(localStorage.getItem('huiyue-world'));w.settings.randomEvents=false;w.settings.autoPrompt=false;w.settings.autoImage=false;const a=w.artists[0],o=C.quote(w,a.id,{price:a.min,days:4,brief:'flower garden'});C.pay(w,o.id);C.advance(w,1);await S.saveWorld(w);return o.id;});
 await page.reload();await page.waitForFunction(()=>globalThis.Huiyue);await page.evaluate(()=>Huiyue.open());
 await page.locator('[data-act="nav"][data-id="bench"]').click();await page.locator(`[data-act="order"][data-id="${orderId}"]`).first().click();
 await page.locator('[data-act="versionMain"]').first().click();
 await page.waitForFunction(async id=>{const S=await import('/storage.js?v=1.3.1'),w=await S.loadWorld(localStorage.getItem('huiyue-world'));return w.commissions.find(o=>o.id===id).versions[0].status==='prompted';},orderId);
 await page.locator('[data-act="versionMain"]').first().click();
 await page.waitForFunction(async id=>{const S=await import('/storage.js?v=1.3.1'),w=await S.loadWorld(localStorage.getItem('huiyue-world'));return w.commissions.find(o=>o.id===id).versions[0].status==='ready';},orderId);
 assert.ok((await state()).commissions.find(o=>o.id===orderId).versions[0].asset);
 assert.ok(!JSON.stringify(await state()).includes('test-image'));assert.deepEqual(errors,[]);
 console.log('PASS: 6 URL-only connections, independent LLM/image keys, model wrappers, NAI ZIP/JSON original bytes, persistent protocol settings, real prompt-to-image UI pipeline.');
}finally{await browser.close();}
