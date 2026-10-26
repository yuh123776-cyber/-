import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../core.js?v=1.1.1';
import * as F from '../finance.js?v=1.1.1';
import {initialEstimate,storyChanges} from '../funds-bridge.js?v=1.1.1';
test('注销关闭未接请求，保留已接订单与资产；重新开通才收新请求',()=>{
 const w=C.newWorld(),first=C.activateArtist(w);C.acceptIncoming(w,first.id);const pending=C.incoming(w),balance=w.accounts.artist.balance;
 C.deactivateArtist(w);assert.equal(w.role,'client');assert.equal(w.artistActivated,false);assert.equal(pending.status,'cancelled');assert.equal(first.status,'working');assert.equal(w.accounts.artist.balance,balance);assert.throws(()=>C.incoming(w));assert.throws(()=>C.acceptIncoming(w,pending.id));
 C.activateArtist(w);assert.equal(w.commissions.length,3);assert.equal(first.status,'working');assert.throws(()=>C.activateArtist(w));
});
test('剧情资产只初始化一次，随机分配守恒，地区切换不改变余额',()=>{
 const w=C.newWorld(),identity={key:'persona:alice',name:'Alice'};const f=F.initialize(w,identity,{totalCny:1234.56,basis:'明确余额',inferred:false},'chat',4,()=>.5);
 assert.equal(F.total(f),123456);assert.throws(()=>F.initialize(w,identity,{totalCny:9999},'chat',4));const amounts=f.channels.map(c=>c.cents);F.setRegion(f,'US','我的 Visa 储蓄卡');assert.deepEqual(f.channels.map(c=>c.cents),amounts);assert.equal(F.channelName(f,f.channels[0]),'PayPal');assert.equal(F.channelName(f,f.channels[2]),'我的 Visa 储蓄卡');
 assert.equal(F.persona({name1:'Alice',chatMetadata:{persona:'alice.png'},powerUserSettings:{persona_description:'余额变了'}}).key,'persona:alice.png');assert.equal(F.account(structuredClone(w),identity.key).initialized,true);
});
test('充值同时扣剧情账户并增加绘币，不足余额和重复提交不改动账本',()=>{
 const w=C.newWorld(),key='persona:a',f=F.initialize(w,{key,name:'A'},{totalCny:3000,basis:'test'},'chat',0,()=>.5);const channel=f.channels[0],before=channel.cents;
 F.recharge(w,key,channel.id,'client',100,'r1');assert.equal(channel.cents,before-10000);assert.equal(w.accounts.client.balance,10100);assert.equal(f.ledger.at(-1).cents,-10000);assert.equal(w.ledger.at(-1).delta,100);
 const snapshot=structuredClone(w);assert.throws(()=>F.recharge(w,key,channel.id,'client',100,'r1'));assert.throws(()=>F.recharge(w,key,channel.id,'client',100000,'r2'));assert.throws(()=>F.recharge(w,key,channel.id,'client',1.5,'r3'));assert.deepEqual(w,snapshot);
});
test('正文收支有原文来源且仅入账一次，冲突整批不落账',()=>{
 const w=C.newWorld(),key='persona:a',f=F.initialize(w,{key,name:'A'},{totalCny:300,basis:'test'},'chat',0,()=>.5);const source={id:'chat:1',chatId:'chat',messageId:1,body:'user 用支付宝支付了 20 元，又收到了 10 元。'},channelId=f.channels[0].id,before=f.channels[0].cents;
 assert.equal(F.applyStory(w,key,source,[{deltaCny:-20,channelId,quote:'支付了 20 元'}]),true);assert.equal(f.channels[0].cents,before-2000);assert.equal(F.applyStory(w,key,source,[{deltaCny:-20,channelId,quote:'支付了 20 元'}]),false);
 const snapshot=structuredClone(w);assert.throws(()=>F.applyStory(w,key,{...source,id:'chat:2'},[{deltaCny:10,channelId,quote:'收到了 10 元'},{deltaCny:-100000,channelId,quote:'支付了 20 元'}]));assert.deepEqual(w,snapshot);
 assert.throws(()=>F.applyStory(w,key,{...source,id:'chat:3'},[{deltaCny:10,channelId,quote:'不存在的原句'}]));
});
test('明确余额不把月薪当存款，并避免总额与分账户重复相加',()=>{
 assert.equal(F.explicitBalance('月薪 30000 元，喜欢画画'),null);assert.equal(F.explicitBalance('余额：1.5万元').totalCny,15000);assert.equal(F.explicitBalance('总余额 3000 元，支付宝余额 1000 元，微信余额 2000 元').totalCny,3000);assert.equal(F.explicitBalance('支付宝余额1000元，微信余额2000元').totalCny,3000);
});
test('虚拟熟人互动有可见身份，不替真实 user 自动点赞；两种身份独立切换点赞',()=>{
 const w=C.newWorld(),author=w.artists[0],p=C.socialReactions(w,{id:C.uid(),author:author.name,artistId:author.id,body:'今天完成了配色练习',comments:[]},()=>.5);
 assert.ok(p.comments.length);assert.ok(p.likes);assert.equal(p.likes,p.likePeople.length);assert.ok(!p.likePeople.some(person=>person.id===w.accounts.client.id));assert.ok(!p.likePeople.some(person=>person.id===author.id));const count=p.likes;
 C.toggleLike(w,p);assert.equal(p.likes,count+1);assert.equal(C.hasLiked(w,p),true);w.role='artist';assert.equal(C.hasLiked(w,p),false);C.toggleLike(w,p);assert.equal(p.likes,count+2);w.role='client';C.toggleLike(w,p);assert.equal(p.likes,count+1);
 const legacy={likes:12,liked:true,comments:[]};C.toggleLike(w,legacy);assert.equal(legacy.likes,11);assert.equal(C.hasLiked(w,legacy),false);
});
test('旧存档可载入；篡改剧情资产的负余额被拒绝',()=>{const w=C.newWorld();assert.equal(C.validateWorld(w),w);const f=F.initialize(w,{key:'user',name:'user'},{totalCny:100},'chat',0);assert.equal(C.validateWorld(w),w);f.channels[0].cents=-1;assert.throws(()=>C.validateWorld(w));});
test('人设明确余额不请求模型；推定与正文仅使用酒馆模型，忽略独立 API 配置',async()=>{
 const w=C.newWorld();w.settings.chat={mode:'openai',url:'https://must-not-call.invalid',model:'not-allowed'};let calls=0,prompt='';
 const c={name1:'Alice',chatMetadata:{persona:'alice.png'},powerUserSettings:{persona_description:'余额3000元'},generateRaw:async input=>{calls++;prompt=input.prompt[0].content;return JSON.stringify({totalCny:8000,inferred:true,basis:'虚构职业推定'});}};
 globalThis.SillyTavern={getContext:()=>c};
 try{
  let estimate=await initialEstimate(w);assert.equal(estimate.result.totalCny,3000);assert.equal(calls,0);
  c.powerUserSettings.persona_description='Alice 是工作多年的插画师';estimate=await initialEstimate(w);assert.equal(estimate.result.totalCny,8000);assert.equal(calls,1);assert.ok(prompt.includes('插画师'));
  const f=F.initialize(w,estimate.identity,estimate.result,'chat',0);c.generateRaw=async input=>{calls++;prompt=input.prompt[0].content;return JSON.stringify({events:[{deltaCny:-20,channelId:'channel-0',quote:'支付20元'}]});};
  const events=await storyChanges(f,{body:'Alice用支付宝支付20元'});assert.equal(calls,2);assert.equal(events[0].deltaCny,-20);assert.ok(prompt.includes('Alice用支付宝支付20元'));assert.ok(prompt.includes('充值绘币'));
 }finally{delete globalThis.SillyTavern;}
});
test('世界书只本地采用标明 user 的余额条目，不读取其他人的余额',async()=>{
 const c={name1:'Alice',chatMetadata:{persona:'alice.png'},powerUserSettings:{persona_description:'画师 Alice',persona_description_lorebook:'资料'},loadWorldInfo:async()=>({entries:{a:{comment:'Bob',content:'余额90000元'},b:{comment:'Alice 资产',content:'余额5000元'}}}),generateRaw:async()=>{throw Error('不应请求模型');}};
 globalThis.SillyTavern={getContext:()=>c};try{const estimate=await initialEstimate(C.newWorld());assert.equal(estimate.result.totalCny,5000);}finally{delete globalThis.SillyTavern;}
});
test('模型重复收支整批拒绝且不改变余额',()=>{
 const w=C.newWorld(),key='persona:a',f=F.initialize(w,{key,name:'A'},{totalCny:300},'chat',0,()=>.5),event={deltaCny:-10,channelId:'channel-0',quote:'付了10元'},before=F.total(f);
 assert.throws(()=>F.applyStory(w,key,{id:'chat:1',body:'付了10元'},[event,event]));assert.equal(F.total(f),before);assert.equal(f.ledger.length,1);
});
test('画师串保留权重原文，模型漏掉预设时仍合并，已有预设不重复添加',()=>{
 const a=C.artist({promptPreset:'artist:stardust, (watercolor:1.2)',negativePreset:'watermark, bad hands'}),presets=C.artistPresets(a);
 const first=C.withArtistPresets('1girl, garden','blurry',presets);assert.equal(first.positive,'artist:stardust, (watercolor:1.2), 1girl, garden');assert.equal(first.negative,'watermark, bad hands, blurry');
 assert.deepEqual(C.withArtistPresets(first.positive,first.negative,presets),first);assert.deepEqual(C.artistPresets({style:'旧画师'}),{positive:'',negative:''});
 const snapshot=structuredClone(presets);a.promptPreset='new style';assert.equal(snapshot.positive,'artist:stardust, (watercolor:1.2)');assert.deepEqual(C.withArtistPresets('manual','',{positive:'',negative:''}),{positive:'manual',negative:''});
});
