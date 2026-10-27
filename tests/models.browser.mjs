import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.resolve(process.env.HUIYUE_TEST_ROOT||'.');
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),calls=[],errors=[];
 let fail=false,delay=false,release;
 await context.route('http://huiyue.test/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script type="module" src="/loader-v1.3.2.js"></script>'});
  const file=path.resolve(root,url.pathname.slice(1));
  if(!file.startsWith(root+path.sep))return route.abort();
  return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/css',body:await fs.readFile(file)});
 });
 await context.route('https://models.test/**',async route=>{
  calls.push({url:route.request().url(),headers:route.request().headers()});
  if(delay)await new Promise(resolve=>release=resolve);
  await route.fulfill({status:fail?401:200,contentType:'application/json',body:JSON.stringify({data:[{id:'text-model'},{id:'image-model'},{id:'<unsafe>"model'}]})}).catch(()=>{});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const open=async()=>{await page.waitForFunction(()=>globalThis.Huiyue);await page.evaluate(()=>Huiyue.open());await page.locator('[data-act="nav"][data-id="me"]').click();await page.locator('[data-act="settings"]').click();};
 await page.goto('http://huiyue.test/');await open();
 assert.equal(await page.locator('[data-fetch-models]').count(),3);assert.equal(await page.locator('[data-api-kind] details, [data-relay-preset]').count(),0);assert.equal(await page.locator('[data-api-kind] input:not([type=hidden])').count(),6);
 for(const kind of ['chat','prompt','image']){
  const box=page.locator(`[data-api-kind="${kind}"]`),button=box.locator('[data-fetch-models]');
  assert.equal(await button.isDisabled(),true);
  await box.locator(`[name="${kind}.url"]`).fill('https://models.test/v1/');
  await box.locator(`[name="${kind}.key"]`).fill(`draft-${kind}`);
  await button.click();await box.locator('[data-model-status]').filter({hasText:'读取到'}).waitFor();
  assert.equal(calls.at(-1).headers.authorization,`Bearer draft-${kind}`);
  assert.equal(calls.at(-1).url,'https://models.test/v1/models');
  assert.equal(await box.locator('[data-model-list] option').count(),4);
  await box.locator('[data-model-list]').selectOption(kind==='image'?'image-model':'text-model');
  assert.equal(await box.locator(`[name="${kind}.model"]`).inputValue(),kind==='image'?'image-model':'text-model');
 }
 await page.locator('[data-form=settings] > button[type=submit]').click();
 await page.waitForFunction(()=>document.querySelector('[name="chat.key"]')?.value==='');
 assert.equal(await page.locator('[name="chat.key"]').inputValue(),'');
 const box=page.locator('[data-api-kind="chat"]'),button=box.locator('[data-fetch-models]');
 await button.click();await box.locator('[data-model-status]').filter({hasText:'读取到'}).waitFor();assert.equal(calls.at(-1).headers.authorization,'Bearer draft-chat');
 fail=true;await button.click();await box.locator('[data-model-status]').filter({hasText:'HTTP 401'}).waitFor();
 assert.equal(await box.locator('[name="chat.model"]').inputValue(),'text-model');assert.equal(await button.isEnabled(),true);
 fail=false;delay=true;await button.click();
 while(!release)await new Promise(r=>setTimeout(r,20));
 await box.locator('[name="chat.url"]').fill('https://models.test/new/v1');release();delay=false;
 await page.waitForTimeout(100);assert.equal(await box.locator('[data-model-list] option').count(),1);
 await button.click();await box.locator('[data-model-status]').filter({hasText:'读取到'}).waitFor();await box.locator('[name="chat.model"]').selectOption('text-model');
 await page.locator('[data-form=settings] > button[type=submit]').click();
 await page.waitForFunction(async()=>{const S=await import('/storage.js?v=1.3.2');return (await S.loadWorld(localStorage.getItem('huiyue-world')))?.settings.chat.model==='text-model';});
 await page.reload();await open();assert.equal(await page.locator('[name="chat.model"]').inputValue(),'text-model');
 const saved=await page.evaluate(async()=>{const S=await import('/storage.js?v=1.3.2');return JSON.stringify(await S.loadWorld(localStorage.getItem('huiyue-world')));});
 assert.ok(!saved.includes('draft-chat'));assert.deepEqual(errors,[]);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS: three API pickers, draft/saved keys, safe options, select/save/reload, HTTP failure/retry, stale response, URL-only configuration, mobile layout, no persisted key.');
}finally{await browser.close();}
