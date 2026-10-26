import {uid,integer,money,record,text} from './core.js?v=1.1.1';
export const regions={CN:{name:'中国大陆',channels:['支付宝','微信支付','银行卡']},US:{name:'美国',channels:['PayPal','Visa','银行卡']},JP:{name:'日本',channels:['PayPay','Visa','银行卡']},OTHER:{name:'其他国家/地区',channels:['PayPal','Visa','银行卡']}};
export function persona(context){
    const settings=context?.powerUserSettings||{},description=String(settings.persona_description||'');
    const matches=Object.entries(settings.persona_descriptions||{}).filter(([id,p])=>p.description===description&&settings.personas?.[id]===context?.name1);
    const id=context?.chatMetadata?.persona||(matches.length===1?matches[0][0]:context?.name1||'standalone-user');
    return {key:'persona:'+id,name:context?.name1||'user',description,book:settings.persona_description_lorebook||''};
}
export function account(w,key){return w.finances?.[key]||null;}
export function total(f){return f.channels.reduce((n,c)=>n+c.cents,0);}
export function toCents(amount){const value=Number(amount);if(!Number.isFinite(value)||value<0||value>100000000)throw Error('剧情金额无效');const cents=Math.round(value*100);if(Math.abs(value*100-cents)>.0001)throw Error('剧情金额最多保留两位小数');return cents;}
export function explicitBalance(description){
    const source=String(description).replace(/[,，](?=\d{3}(?:\D|$))/g,'');
    const pattern=/(?:总余额|可用资金|存款|支付宝余额|微信余额|银行卡余额|余额)\s*[:：为是约]?\s*(\d+(?:\.\d+)?)\s*(万|千|亿)?\s*(?:元|人民币|RMB|CNY)(?!日)/gi;
    const matches=[...source.matchAll(pattern)];if(!matches.length)return null;
    const whole=matches.find(m=>/总余额|可用资金|存款/.test(m[0]));
    const selected=whole?[whole]:matches;
    const value=selected.reduce((sum,m)=>sum+Number(m[1])*({万:10000,千:1000,亿:100000000}[m[2]]||1),0);
    toCents(value);return {totalCny:value,inferred:false,basis:'user 人设明确记载：'+selected.map(m=>m[0]).join('；')};
}
export function initialize(w,identity,result,chatId,cursor,random=Math.random){
    if(account(w,identity.key))throw Error('这个 user 的剧情资产已经初始化，不会重新判定');
    const cents=toCents(result.totalCny),region=regions[w.settings.paymentRegion]?w.settings.paymentRegion:'CN';
    const weights=[.2+random(),.2+random(),.2+random()],sum=weights.reduce((n,x)=>n+x,0);
    const first=Math.floor(cents*weights[0]/sum),second=Math.floor(cents*weights[1]/sum);
    const portions=[first,second,cents-first-second];
    const f={id:uid(),personaKey:identity.key,name:identity.name,initialized:true,region,basis:text(result.basis,2000),inferred:result.inferred===true,channels:portions.map((value,i)=>({id:'channel-'+i,cents:value})),ledger:[],processed:{},cursors:{[chatId]:cursor},storySync:true};
    f.ledger.push({id:uid(),kind:'initial',cents,day:w.day,reason:f.inferred?'首次 AI 推定并分配':'首次读取明确余额并分配'});
    (w.finances||={})[identity.key]=f;return f;
}
export function channelName(f,c){const index=f.channels.findIndex(x=>x.id===c.id);return index===2&&f.bankName?f.bankName:regions[f.region].channels[index];}
export function setRegion(f,region,bankName){if(!regions[region])throw Error('请选择支持的国家/地区');f.region=region;f.bankName=text(bankName,50);}
export function recharge(w,identityKey,channelId,role,amount,reference){
    const value=integer(amount,1,1000000),cents=value*100,f=account(w,identityKey);
    if(!f)throw Error('请先读取 user 人设并初始化剧情资产');
    const channel=f.channels.find(c=>c.id===channelId);if(!channel)throw Error('支付账户不存在');
    if(!reference||f.ledger.some(entry=>entry.ref===reference)||w.ledger.some(entry=>entry.ref===reference))throw Error('这笔充值已经处理');
    if(channel.cents<cents)throw Error('所选支付账户余额不足，请改用其他账户或减少金额');
    integer(w.accounts[role]?.balance+value);
    channel.cents-=cents;money(w,role,value,'剧情资产充值绘币 · '+channelName(f,channel),reference);
    f.ledger.push({id:uid(),kind:'recharge',ref:reference,channelId,channelLabel:channelName(f,channel),cents:-cents,day:w.day,reason:`充值 ${value} 绘币至${role==='artist'?'画师':'甲方'}钱包`,balance:channel.cents});
    record(w,`${f.name} 从${channelName(f,channel)}转入 ${value} 绘币（剧情虚拟资金）`);
}
export function applyStory(w,key,source,events){
    const f=account(w,key);if(!f||!f.storySync)return false;
    if(f.processed[source.id])return false;
    if(!Array.isArray(events)||events.length>12)throw Error('正文收支格式无效');
    const signatures=new Set();
    const changes=events.map(event=>{
        const quote=text(event.quote,1500);if(!quote||!source.body.includes(quote))throw Error('收支缺少可核对的正文原句');
        const delta=Number(event.deltaCny);if(!Number.isFinite(delta)||delta===0)throw Error('收支金额无效');
        const normalized=quote.replace(/[,，](?=\d{3}(?:\D|$))/g,'');
        const amounts=[...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(万|千|亿)?/g)].map(match=>Number(match[1])*({万:10000,千:1000,亿:100000000}[match[2]]||1));
        if(amounts.length&&!amounts.some(value=>Math.abs(value-Math.abs(delta))<.0001))throw Error('收支金额与正文原句不符，本次未入账');
        const cents=toCents(Math.abs(delta))*Math.sign(delta),channel=f.channels.find(c=>c.id===event.channelId);
        if(!channel)throw Error('收支账户不明确');
        const signature=JSON.stringify([channel.id,cents,quote]);if(signatures.has(signature))throw Error('AI 返回了重复收支，本次没有入账');signatures.add(signature);
        return {channel,cents,quote};
    });
    const balances=new Map(f.channels.map(c=>[c.id,c.cents]));
    for(const change of changes){const next=balances.get(change.channel.id)+change.cents;if(!Number.isSafeInteger(next)||next<0||next>10000000000)throw Error('正文收支与当前余额冲突，请在剧情资产中核对');balances.set(change.channel.id,next);}
    for(const {channel,cents,quote} of changes){channel.cents+=cents;f.ledger.push({id:uid(),kind:'story',sourceId:source.id,chatId:source.chatId,messageId:source.messageId,cents,channelId:channel.id,channelLabel:channelName(f,channel),quote,day:w.day,reason:cents>0?'正文收入':'正文支出',balance:channel.cents});}
    f.processed[source.id]={body:source.body.slice(0,10000),count:changes.length};return changes.length>0;
}
export function validate(f){
    if(!f||!Array.isArray(f.channels)||f.channels.length!==3||!regions[f.region]||!Array.isArray(f.ledger)||!f.processed||!f.cursors)throw Error('剧情资产格式损坏');
    const ids=new Set();for(const c of f.channels){integer(c.cents,0,10000000000);if(!c.id||ids.has(c.id))throw Error('支付账户编号重复');ids.add(c.id);}return f;
}
