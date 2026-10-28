import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../core.js?v=1.5.0';
import {effectivePresets,galleryItems} from '../render-presets.js?v=1.5.0';
import {parsePricingRules,priceQuote,settledOfferPrice} from '../pricing.js?v=1.5.0';
import * as PJ from '../projects.js?v=1.5.0';
import * as IN from '../interaction-engine.js?v=1.5.0';
import * as RC from '../persona-context.js?v=1.5.0';
import {dialogueSettings,textInstructions,textMessages,imageInstructions,DEFAULT_DM_PRESET} from '../instructions.js?v=1.5.0';
import {migrateV15} from '../migrations.js?v=1.5.0';
test('正反向独立回退：草稿专用、画师单独、全局默认',()=>{
 const settings={renderDefaults:{positive:'global+',negative:'global-',draftPositive:'draft+'}},a={promptPreset:'artist+',negativePreset:''};
 let p=effectivePresets(settings,a,'草稿');assert.equal(p.positive,'draft+');assert.equal(p.negative,'global-');
 p=effectivePresets(settings,a,'线稿');assert.equal(p.positive,'artist+');assert.equal(p.negative,'global-');
 settings.renderDefaults.draftNegative='draft-';assert.equal(effectivePresets(settings,{negativePreset:'artist-'},'草稿').negative,'draft-');
 settings.renderDefaults.draftPositive=' ';assert.equal(effectivePresets(settings,a,'草稿').positive,'artist+');assert.equal(effectivePresets(settings,{},'成稿').positive,'global+');
});
test('重 roll 保留原图与提示词，只换种子；填写修改才标记重写并计次数',()=>{
 const w=C.newWorld(),o=C.quote(w,w.artists[0].id,{price:280,brief:'白发 OC 花园立绘'});C.pay(w,o.id);const v=C.placeholder(w,o.id);Object.assign(v,{positive:'original+',negative:'original-',asset:'original-image',status:'ready',seed:123});
 const copy=structuredClone(v),n=C.rerender(w,v.id);assert.notEqual(n.seed,v.seed);assert.equal(n.positive,v.positive);assert.equal(n.asset,null);assert.equal(n.revisionNote,'');assert.equal(o.revisions,0);assert.deepEqual(v,copy);
 const edited=C.rerender(w,n.id,'只把眼睛改成蓝色',true);assert.equal(edited.basePositive,'original+');assert.equal(edited.revisionNote,'只把眼睛改成蓝色');assert.equal(o.revisions,1);assert.equal(edited.status,'empty');
});
test('重绘旧阶段不能跳过当前阶段验收，完整图片集按身份隔离',()=>{
 const w=C.newWorld(),o=C.quote(w,w.artists[0].id,{price:280,brief:'完整角色设计需求'});C.pay(w,o.id);const draft=C.placeholder(w,o.id,'草稿');draft.asset='draft-image';draft.positive='draft';draft.source='ai';C.approve(w,o.id);const line=C.placeholder(w,o.id,'线稿');line.asset='line-image';line.source='ai';const reroll=C.rerender(w,draft.id);assert.equal(reroll.detached,true);assert.equal(C.activeVersion(o),line);C.approve(w,o.id);assert.equal(o.stage,2);assert.equal(galleryItems(w,'client','ai').length,2);assert.equal(galleryItems(w,'artist').length,0);
});
test('定价倍率、同人折扣和关系折扣叠加；基础价不足会拒绝，总价可超基础上限',()=>{
 const w=C.newWorld(),a=w.artists[0];a.pricingRules=parsePricingRules('商用 * 2\n印刷 * 1.5\nvup * 3\n工程文件 * 1.5\n星河IP的同人打95折');
 const p=priceQuote(a,{basePrice:280,commercial:true,usages:['print'],ip:'星河IP'});assert.equal(p.required,798);assert.equal(p.applied.length,3);
 assert.throws(()=>C.quote(w,a.id,{basePrice:280,price:280,commercial:true,brief:'完整商用需求'}),/报价不足/);assert.equal(w.commissions.length,0);
 const o=C.quote(w,a.id,{basePrice:280,price:1260,usages:['vup','source'],brief:'VUP 工程文件用途'});assert.equal(o.price,1260);assert.equal(o.pricing.required,1260);
 assert.throws(()=>parsePricingRules('商用 = 随便'));assert.equal(parsePricingRules('xxIP同人打9.5折')[0].factor,.95);
});
test('关联粉丝关系可以有自愿优惠和赠图，赠图不重复扣款',async()=>{
 const w=C.newWorld(),a=w.artists[0];a.relationship='她是 {{user}} 的粉丝';const benefit=await IN.assessQuote(w,a,{basePrice:280,price:252,brief:'花园 OC 立绘'});assert.equal(benefit.accepted,true);assert.equal(benefit.discount,.9);assert.equal(benefit.gift,true);
 const o=C.quote(w,a.id,{basePrice:280,price:252,discount:benefit.discount,giftOffer:true,brief:'花园 OC 立绘'});C.pay(w,o.id);assert.equal(w.accounts.client.balance,9748);assert.equal(w.ledger.length,1);assert.equal(w.commissions.filter(o=>o.gift).length,1);assert.equal(w.commissions.find(o=>o.gift).price,0);assert.equal(C.validateWorld(w),w);assert.throws(()=>C.pay(w,o.id));
});
test('企划先等待，答应后先私信，不自动创建委托；拒绝带理由',()=>{
 const w=C.newWorld(),a=w.artists[0],p={id:C.uid(),title:'星河企划',brief:'角色立绘',budget:800,deadline:20,applicants:[]};w.projects.push(p);
 const item=PJ.enqueue(w,p,a,{responseDays:2,responseMinutes:5,decision:'accepted',reason:'喜欢这个设定',opening:'老师这个设定有点戳我，先来聊聊！'},1000);assert.equal(item.status,'pending');assert.deepEqual(p.applicants,[]);assert.equal(PJ.resolveDue(w,1001),0);assert.equal(w.commissions.length,0);
 w.day=3;assert.equal(PJ.resolveDue(w,1002),1);assert.equal(item.status,'accepted');assert.equal(w.messages['client:'+a.id][0].body,'老师这个设定有点戳我，先来聊聊！');assert.equal(w.commissions.length,0);
 const b=w.artists[1],no=PJ.enqueue(w,p,b,{responseDays:1,responseMinutes:1,decision:'rejected',reason:'这周排不开'},1000);PJ.resolveDue(w,61001);assert.equal(no.status,'rejected');assert.equal(no.reason,'这周排不开');
});
test('正文明确答复优先于预定回复，去重；没有决定时不误判接受',async()=>{
 const w=C.newWorld(),a=w.artists[0];a.linked={avatar:'char.png'};const p={id:C.uid(),title:'星河企划',budget:800,deadline:20,applicants:[]};w.projects.push(p);const item=PJ.enqueue(w,p,a,{responseDays:1,responseMinutes:1,decision:'accepted',opening:'计划接受'},0);
 const c={characters:[{avatar:'char.png'}],characterId:0,getCurrentChatId:()=> 'story',chat:[{is_user:false,mes:'我拒绝这个星河企划，近期档期确实排不开。'}]};globalThis.SillyTavern={getContext:()=>c};
 try{assert.equal(await IN.followStory(w,0),true);assert.equal(item.source,'story');assert.equal(item.status,'rejected');assert.equal(await IN.followStory(w,0),false);w.day=8;PJ.resolveDue(w,999999);assert.equal(item.status,'rejected');assert.equal(PJ.explicitStoryDecision('还没决定接受这个企划。'),null);}finally{delete globalThis.SillyTavern;}
});
test('统一预设模式控制拒绝理由、首条私信与甲方开场',async()=>{
 const w=C.newWorld(),a=w.artists[0];w.settings.interactionPresets={rejections:['预设拒绝'],openings:['预设第一条'],customerOpenings:['我想约：{{brief}}']};
 const p={id:'p',brief:'星空立绘',budget:1000,deadline:30};let plan=await IN.invitationPlan(w,p,a,undefined,()=>.8);assert.equal(plan.decision,'accepted');assert.equal(plan.opening,'预设第一条');plan=await IN.invitationPlan(w,{...p,budget:1},a,undefined,()=>.8);assert.equal(plan.reason,'预设拒绝');assert.equal(await IN.customerOpening(w,{}, {brief:'双人立绘'}),'我想约：双人立绘');
});
test('甲方角色锁定不继承“你是画师”的基础模板，人设与关系进入 AI 上下文',async()=>{
 const w=C.newWorld();w.settings.chat.template='你是画师，这个旧模板不应进入甲方私信';const settings=dialogueSettings(w.settings,{speakerRole:'client'});assert.ok(settings.template.includes('你是来委托画师的甲方'));assert.ok(!settings.template.includes('这个旧模板'));assert.ok(DEFAULT_DM_PRESET.includes('ACGN'));assert.ok(DEFAULT_DM_PRESET.includes('优先读'));
 globalThis.SillyTavern={getContext:()=>({name1:'小夏',powerUserSettings:{persona_description:'喜欢 OC 的人'},characters:[{avatar:'a',description:'画师是小夏的粉丝',data:{extensions:{world:'book'}}}],characterId:0,chat:[{name:'画师',mes:'记得她喜欢蓝色'}],loadWorldInfo:async()=>({entries:{one:{content:'画师一直关注小夏的作品。'}}})})};
 try{const context=await RC.fullRelationshipContext({name:'画师',linked:{avatar:'a'}});assert.ok(context.user.persona.includes('OC'));assert.equal(context.recentStory.length,1);assert.equal(context.worldInfo.length,1);}finally{delete globalThis.SillyTavern;}
});
test('推理提示位置和图片规范真正参与请求，原始配置不被改写',()=>{
 const s={template:'BASE',rules:'RULE',instructions:'EXTRA',reasoningNotes:'THINK',reasoningPosition:'beforeRules'};assert.ok(textInstructions(s,'prompt').startsWith('THINK'));s.reasoningPosition='afterTask';const messages=[{role:'user',content:'TASK'}];assert.equal(textMessages(s,'prompt',messages).at(-1).content,'THINK');assert.equal(messages.length,1);assert.ok(!textInstructions(s,'chat').includes('EXTRA'));assert.equal(imageInstructions({rules:'RULE',instructions:'EXTRA',reasoningNotes:'REASON',reasoningPosition:'after'},'IMAGE'),'RULE\n\nEXTRA\n\nIMAGE\n\nREASON');
});
test('甲方头像从库独立分配，旧存档迁移兼容且不触发回复',()=>{
 const w=C.newWorld();w.settings.customerAvatarPool=[{id:'p',asset:'customer-face',name:'甲方'}];w.accounts.artist.avatar='my-face';w.artistActivated=true;const o=C.incoming(w);assert.equal(C.contact(w,o.clientId).avatar,'customer-face');assert.notEqual(C.contact(w,o.clientId).avatar,w.accounts.artist.avatar);const p={id:'old',title:'旧企划',brief:'旧',budget:400,deadline:20,applicants:[w.artists[0].id]};w.projects.push(p);const count=Object.keys(w.messages).length;migrateV15(w);assert.equal(p.invitations[0].status,'accepted');assert.equal(p.invitations[0].source,'legacy');assert.equal(Object.keys(w.messages).length,count);assert.equal(C.validateWorld(w),w);
});


test('最终报价实际应用折扣，已经填写优惠价时不重复打折，并从需求识别用途',()=>{
 const a=C.artist({min:400,max:1200});a.pricingRules=parsePricingRules('商用 * 2\n星河IP同人打95折');
 assert.equal(settledOfferPrice(a,{basePrice:400,price:800,brief:'OC 商用宣传图'},.8),640);
 assert.equal(settledOfferPrice(a,{basePrice:400,price:640,commercial:true},.8),640);
 assert.equal(settledOfferPrice(a,{basePrice:400,price:800,commercial:true,ip:'星河IP'}),760);
 assert.equal(settledOfferPrice(a,{basePrice:400,price:760,commercial:true,ip:'星河IP'}),760);
 assert.equal(priceQuote(a,{basePrice:400,brief:'非商用的自设立绘'}).required,400);
});
