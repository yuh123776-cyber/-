import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.resolve(process.env.HUIYUE_TEST_ROOT||'.'),calls=[],errors=[];
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 // Seed the previous database schema before the extension loads.
 const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><script>
 function boot(){const script=document.createElement('script');script.type='module';script.src='/loader-v1.5.0.js';document.head.append(script);}
 if(localStorage.getItem('profile-migration-seeded'))boot();else{const request=indexedDB.open('huiyue-v1',1);request.onupgradeneeded=()=>{request.result.createObjectStore('worlds',{keyPath:'id'});request.result.createObjectStore('assets',{keyPath:'id'});};request.onsuccess=()=>{const db=request.result,t=db.transaction(['worlds','assets'],'readwrite');t.objectStore('worlds').put({id:'migration-marker',value:'preserved'});t.objectStore('assets').put({id:'migration-asset',blob:new Blob(['original asset'])});t.oncomplete=()=>{db.close();localStorage.setItem('profile-migration-seeded','1');boot();};};}
 </script>`;
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='huiyue.test'){
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   const file=path.resolve(root,url.pathname.slice(1));if(!file.startsWith(root+path.sep))return route.abort();
   return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/css',body:await fs.readFile(file)});
  }
  const call={url:url.href,headers:route.request().headers(),method:route.request().method()};calls.push(call);
  if(!call.headers.authorization)return route.fulfill({status:401,body:'missing key'});
  if(url.pathname.endsWith('/models'))return route.fulfill({contentType:'application/json',body:JSON.stringify({data:[{id:'model-a',supported_endpoint_types:['openai']},{id:'model-b',supported_endpoint_types:['openai-response']}]})});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(url.pathname.endsWith('/responses')?{output:[{type:'message',content:[{type:'output_text',text:'ok'}]}]}:{choices:[{message:{content:'ok'}}]})});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const open=async()=>{await page.waitForFunction(()=>globalThis.Huiyue);await page.evaluate(()=>Huiyue.open());await page.locator('[data-act="nav"][data-id="me"]').click();await page.locator('[data-act="settings"]').click();};
 const box=()=>page.locator('[data-api-kind="chat"]');
 const state=()=>page.evaluate(async()=>{const S=await import('/storage.js?v=1.5.0');return S.loadWorld(localStorage.getItem('huiyue-world'));});
 const save=async model=>{
  await page.locator('[data-form=settings] > button[type=submit]').click();
  await page.waitForFunction(async model=>{const S=await import('/storage.js?v=1.5.0'),w=await S.loadWorld(localStorage.getItem('huiyue-world'));return w?.settings.chat.model===model&&!!w.settings.chat.apiProfileId;},model);
  await page.waitForFunction(()=>document.querySelector('[name="chat.key"]')?.value==='');
 };
 const fetchModels=async()=>{await box().locator('[data-fetch-models]').click();await box().locator('[data-model-status]').filter({hasText:'读取到'}).waitFor();};
 const invoke=()=>page.evaluate(async()=>{const A=await import('/api.js?v=1.5.0'),S=await import('/storage.js?v=1.5.0'),w=await S.loadWorld(localStorage.getItem('huiyue-world'));return A.complete(w.settings.chat,'chat',[{role:'user',content:'hello'}]);});
 await page.goto('http://huiyue.test/');await open();
 await box().locator('[name="chat.url"]').fill('https://primary.test/v1');await box().locator('[name="chat.key"]').fill('key-alpha');await box().locator('[name="chat.profileName"]').fill('主用 API');
 await fetchModels();await box().locator('[data-model-list]').selectOption('model-a');await save('model-a');
 const primary=(await state()).settings.chat.apiProfileId;
 await page.reload();await open();assert.equal(await box().locator('[name="chat.key"]').inputValue(),'');
 assert.ok((await box().locator('[name="chat.key"]').getAttribute('placeholder')).includes('已保存'));
 await fetchModels();assert.equal(calls.at(-1).headers.authorization,'Bearer key-alpha');assert.equal(await invoke(),'ok');assert.equal(calls.at(-1).headers.authorization,'Bearer key-alpha');
 // Add a second configuration without changing the first one.
 await box().locator('[data-api-profile-action="new"]').click();assert.equal(await box().locator('[name="chat.url"]').inputValue(),'');
 await box().locator('[name="chat.url"]').fill('https://backup.test/v1');await box().locator('[name="chat.key"]').fill('key-beta');await box().locator('[name="chat.profileName"]').fill('备用 <API>');
 await fetchModels();await box().locator('[data-model-list]').selectOption('model-b');await save('model-b');
 const backup=(await state()).settings.chat.apiProfileId;assert.notEqual(primary,backup);
 assert.equal(await box().locator('[data-api-profiles] option').count(),3);
 assert.equal(await box().locator('[data-api-profiles] option:checked').textContent(),'备用 <API>');
 await page.reload();await open();assert.equal(await invoke(),'ok');assert.ok(calls.at(-1).url.endsWith('/responses'));assert.equal(calls.at(-1).headers.authorization,'Bearer key-beta');
 await box().locator('[data-api-profiles]').selectOption(primary);assert.equal(await box().locator('[name="chat.url"]').inputValue(),'https://primary.test/v1');await save('model-a');
 assert.equal(await invoke(),'ok');assert.equal(calls.at(-1).headers.authorization,'Bearer key-alpha');assert.ok(calls.at(-1).url.endsWith('/chat/completions'));
 // Remembered keys never follow a different origin or a different service kind.
 const isolated=await page.evaluate(async id=>{const P=await import('/api-profiles.js?v=1.5.0');return {otherOrigin:P.profileKey(id,'chat','https://other.test/v1'),otherKind:P.profileKey(id,'image','https://primary.test/v1'),publicValue:JSON.stringify(P.getProfile(id,'chat'))};},primary);
 assert.equal(isolated.otherOrigin,'');assert.equal(isolated.otherKind,'');assert.ok(!isolated.publicValue.includes('key-alpha'));
 await box().locator('[data-api-profiles]').selectOption(backup);await save('model-b');
 await box().locator('[data-api-profile-action="clear"]').click();await box().locator('[name="chat.key"][placeholder*="清除"]').waitFor();
 await page.reload();await open();await box().locator('[data-fetch-models]').click();await box().locator('[data-model-status]').filter({hasText:'HTTP 401'}).waitFor();assert.equal(calls.at(-1).headers.authorization,undefined);
 await box().locator('[name="chat.key"]').fill('key-gamma');await save('model-b');await page.reload();await open();assert.equal(await invoke(),'ok');assert.equal(calls.at(-1).headers.authorization,'Bearer key-gamma');
 // Export the ordinary world archive through the real download path.
 const downloaded=page.waitForEvent('download');await page.locator('[data-act="export"]').click();const file=await downloaded,archive=await fs.readFile(await file.path(),'utf8');
 for(const secret of ['key-alpha','key-beta','key-gamma'])assert.ok(!archive.includes(secret));
 await box().locator('[data-api-profiles]').selectOption(primary);await box().locator('[data-api-profile-action="delete"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-api-kind="chat"] [data-api-profiles]').options.length===2);
 await page.reload();await open();assert.equal(await box().locator('[data-api-profiles] option').count(),2);
 const migration=await page.evaluate(async()=>{const S=await import('/storage.js?v=1.5.0'),db=await S.openDB(),world=await S.loadWorld('migration-marker'),asset=await S.getAsset('migration-asset');return {version:db.version,world:world.value,asset:await asset.blob.text(),profiles:(await S.readApiProfiles()).length};});
 assert.equal(migration.version,2);assert.equal(migration.world,'preserved');assert.equal(migration.asset,'original asset');assert.equal(migration.profiles,1);assert.deepEqual(errors,[]);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS: schema migration preserves worlds/assets; persistent keys survive reload; two named APIs switch exact models/protocols/keys; clear/delete persist; no secret in world exports/public records; origin/kind isolation; mobile layout.');
}finally{await browser.close();}
