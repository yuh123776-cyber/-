import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWorld} from '../core.js?v=1.2.0';
import {DEFAULT_DM_PRESET,textInstructions,imageInstructions,dialogueSettings} from '../instructions.js?v=1.2.0';
import {complete,draw,registerImageAdapter} from '../api.js?v=1.2.0';
test('三套指令按用途隔离，旧存档有默认对话预设，留空可停用',()=>{
 const w=newWorld(),before=structuredClone(w.settings);w.settings.dmPreset='DM_ONLY';w.settings.prompt.instructions='PROMPT_ONLY';w.settings.image.instructions='IMAGE_ONLY';
 assert.ok(textInstructions(w.settings.prompt,'prompt').endsWith('PROMPT_ONLY'));assert.ok(!textInstructions(w.settings.chat,'chat').includes('DM_ONLY'));assert.ok(dialogueSettings(w.settings).template.endsWith('DM_ONLY'));assert.deepEqual(w.settings.chat,before.chat);
 assert.equal(imageInstructions(w.settings.image,'subject'),'IMAGE_ONLY\n\nsubject');assert.equal(imageInstructions({},'subject'),'subject');
 delete w.settings.dmPreset;assert.ok(dialogueSettings(w.settings).template.includes(DEFAULT_DM_PRESET));w.settings.dmPreset='';assert.equal(dialogueSettings(w.settings).template,w.settings.chat.template);
});
test('酒馆与独立文本接口都收到提示词 AI 附加指令，私信预设只在专门调用时添加',async()=>{
 const oldFetch=globalThis.fetch,calls=[];globalThis.SillyTavern={getContext:()=>({generateRaw:async data=>{calls.push(data);return 'ok';}})};
 try{
  await complete({mode:'tavern',template:'BASE',instructions:'PROMPT_ONLY'},'prompt',[{role:'user',content:'brief'}]);assert.equal(calls[0].systemPrompt,'BASE\n\nPROMPT_ONLY');
  await complete({mode:'tavern',template:'BASE',instructions:'PROMPT_ONLY'},'chat',[]);assert.equal(calls[1].systemPrompt,'BASE');
  let body;globalThis.fetch=async(url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'ok'}}]})};};
  await complete({mode:'openai',url:'https://mock.invalid/v1',template:'BASE',instructions:'PROMPT_ONLY'},'prompt',[]);assert.equal(body.messages[0].content,'BASE\n\nPROMPT_ONLY');
 }finally{delete globalThis.SillyTavern;globalThis.fetch=oldFetch;}
});
test('酒馆图片命令、独立图片接口及自定义适配器收到图片专用指令，原版本不被改写',async()=>{
 const oldFetch=globalThis.fetch,v={positive:'subject, artist:sample',negative:'blurry',seed:3,stage:'草稿',number:1},before=structuredClone(v),settings={instructions:'IMAGE_ONLY',width:768,height:1024,steps:28,cfg:7};let sent;
 globalThis.SillyTavern={getContext:()=>({SlashCommandParser:{commands:{imagine:{callback:async(args,prompt)=>{sent={args,prompt};throw Error('captured tavern');}}}}})};
 try{
  await assert.rejects(draw({...settings,mode:'tavern'},v),/captured tavern/);assert.equal(sent.prompt,'IMAGE_ONLY\n\nsubject, artist:sample');assert.equal(sent.args.negative,'blurry');
  globalThis.fetch=async(url,options)=>{sent=JSON.parse(options.body);return {ok:false,status:400};};await assert.rejects(draw({...settings,mode:'openai',url:'https://mock.invalid/v1'},v),/HTTP 400/);assert.equal(sent.prompt,'IMAGE_ONLY\n\nsubject, artist:sample\nNegative prompt: blurry');
  registerImageAdapter({id:'custom-instruction-test',label:'mock',generate:async data=>{sent=data;throw Error('captured adapter');}});await assert.rejects(draw({...settings,mode:'custom-instruction-test'},v),/captured adapter/);assert.equal(sent.positive,'IMAGE_ONLY\n\nsubject, artist:sample');assert.equal(sent.instructions,'IMAGE_ONLY');assert.deepEqual(v,before);
 }finally{delete globalThis.SillyTavern;globalThis.fetch=oldFetch;}
});
