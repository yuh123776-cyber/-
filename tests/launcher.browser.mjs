import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(process.env.HUIYUE_TEST_ROOT||'.'),prefix='/scripts/extensions/third-party/-/';
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const html=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${prefix}${manifest.css}"><dialog id="host"><div id="extensions_settings2"></div></dialog><script>const ctx={chatMetadata:{},eventTypes:{CHAT_CHANGED:'chat',MESSAGE_RECEIVED:'received'},eventSource:{on:()=>{}},setExtensionPrompt:()=>{}};window.SillyTavern={getContext:()=>ctx};document.getElementById('host').showModal();</script><script type="module" src="${prefix}${manifest.js}"></script>`;
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try{
 for(const legacy of [false,true]){
  const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  if(legacy)await c.addInitScript("Object.defineProperty(HTMLElement.prototype,'showPopover',{value:undefined,configurable:true})");
  await c.route('http://huiyue.test/**',async route=>{const url=new URL(route.request().url());if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});if(!url.pathname.startsWith(prefix))return route.fulfill({status:404});const file=path.resolve(root,url.pathname.slice(prefix.length));if(!file.startsWith(root+path.sep))return route.fulfill({status:404});return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/css',body:await fs.readFile(file)});});
  const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://huiyue.test/');
  const entry=p.locator('#hy-launcher');await entry.waitFor({state:'visible'});
  await p.waitForFunction(()=>document.getElementById('hy-launcher').parentElement.id==='host');
  const clickable=()=>p.evaluate(()=>{const b=document.getElementById('hy-launcher'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
  assert.equal(await clickable(),true);await entry.click();await p.locator('.hy-artist-card').first().waitFor();assert.equal(await entry.isVisible(),false);
  await p.locator('[data-act=close]').click();await entry.waitFor({state:'visible'});assert.equal(await clickable(),true);
  // Mouse drag moves the control, never opens the app, and survives a reload.
  const before=await entry.boundingBox();await p.mouse.move(before.x+before.width/2,before.y+before.height/2);await p.mouse.down();await p.mouse.move(70,210,{steps:8});await p.mouse.up();assert.equal(await p.locator('#hy-app').isVisible(),false);let moved=await entry.boundingBox();assert.ok(moved.x<before.x-40&&moved.y<before.y-40);const saved=await p.evaluate(()=>localStorage.getItem('huiyue-launcher-position-v1'));assert.ok(saved);
  await p.reload();await entry.waitFor({state:'visible'});let restored=await entry.boundingBox();assert.ok(Math.abs(restored.x-moved.x)<2&&Math.abs(restored.y-moved.y)<2);
  // Real touch events exercise touch-action and pointer capture, not synthetic dispatch.
  const session=await c.newCDPSession(p);restored=await entry.boundingBox();const sx=restored.x+restored.width/2,sy=restored.y+restored.height/2;await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230,y:410,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await p.locator('#hy-app').isVisible(),false);moved=await entry.boundingBox();assert.ok(moved.x>restored.x+70);await session.detach();
  await entry.click();await p.locator('.hy-artist-card').first().waitFor();await p.locator('[data-act=close]').click();await entry.waitFor({state:'visible'});assert.ok(Math.abs((await entry.boundingBox()).x-moved.x)<2);
  await p.evaluate(()=>document.getElementById('host').close());await p.waitForFunction(()=>document.getElementById('hy-launcher').parentElement===document.body);
  await p.evaluate(()=>{const dialog=document.createElement('dialog');dialog.id='second-host';document.body.append(dialog);dialog.showModal();});await p.waitForFunction(()=>document.getElementById('hy-launcher').parentElement.id==='second-host');assert.equal(await clickable(),true);
  await p.evaluate(()=>document.getElementById('second-host').remove());await p.waitForFunction(()=>document.getElementById('hy-launcher').parentElement===document.body);assert.equal(await clickable(),true);
  if(!legacy){await p.addStyleTag({content:'body{transform:translateZ(0);height:150px;overflow:hidden}button{opacity:0!important;visibility:hidden!important}'});assert.equal(await clickable(),true);assert.equal(await entry.evaluate(e=>getComputedStyle(e).opacity),'1');}
  for(const size of [{width:320,height:240},{width:844,height:390},{width:390,height:844}]){await p.setViewportSize(size);await p.waitForFunction(()=>{const r=document.getElementById('hy-launcher').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});assert.equal(await clickable(),true);}
  assert.deepEqual(errors,[]);await c.close();console.log('PASS mobile floating entry '+(legacy?'without Popover API':'with top-layer Popover')+': native settings dialog, open/close recovery, second dialog and removal, mouse/touch drag without accidental opening, position reload persistence, viewport resize and clickable screen bounds.');
 }
}finally{await browser.close();}
