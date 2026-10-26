import {uid,record,placeholder,order,text} from './core.js?v=1.2.1';
import {context,complete,parseJSON} from './api.js?v=1.2.1';
export function currentCharacter(){const c=context();return c?.characters?.[c.characterId]||null;}
export function linkCurrent(a){const ch=currentCharacter();if(!ch)throw Error('请先在酒馆打开一位角色的聊天');a.linked={avatar:ch.avatar,name:ch.name,description:text(ch.description||ch.data?.description,9000),personality:text(ch.personality||ch.data?.personality,4000),scenario:text(ch.scenario||ch.data?.scenario,3000)};a.personality=a.linked.personality||a.personality;}
export async function npcCandidates(w){const c=context(),ch=currentCharacter();if(!ch)throw Error('请先打开角色聊天');let lore='';
    const name=ch.data?.extensions?.world;
    if(name&&c.loadWorldInfo){const b=await c.loadWorldInfo(name);lore=Object.values(b?.entries||{}).map(e=>e.content).join('\n').slice(0,16000);}
    const raw=await complete(w.settings.chat,'chat',[{role:'user',content:`从这些角色卡及世界书资料中提取人物，不要编造缺失信息。只输出 JSON 数组，每项包含 name、bio、personality、style（如未知写待补充）。最多 12 人。\n${JSON.stringify({name:ch.name,description:ch.description||ch.data?.description,personality:ch.personality,lore})}`}]);
    const candidates=parseJSON(raw);if(!Array.isArray(candidates))throw Error('AI 未返回人物数组');return candidates.slice(0,12).filter(x=>x&&typeof x.name==='string').map(x=>({name:text(x.name,50),bio:text(x.bio,4000),personality:text(x.personality,2000),style:text(x.style,500),linked:{avatar:ch.avatar,name:text(x.name,50),description:text(x.bio,9000),personality:text(x.personality,4000),npc:true}}));
}
export function detectChatEvent(w,messageId){
    const c=context(),m=c?.chat?.[messageId];if(!w.settings.bridgeEnabled||!m||m.is_user||m.is_system)return false;
    const ch=currentCharacter();if(!ch)return false;
    const a=w.artists.find(a=>a.linked?.avatar===ch.avatar&&(a.name===m.name||a.linked.name===m.name||!a.linked.npc));if(!a)return false;
    const body=String(m.mes||'');if(!/(草稿|线稿|上色|成稿).{0,20}(发|提交|完成|画好)|(发|提交|完成|画好).{0,20}(草稿|线稿|上色|成稿)/s.test(body))return false;
    const matches=w.commissions.filter(o=>o.artistId===a.id&&o.status==='working');
    const chatId=c.getCurrentChatId?.()||'';const key=`${chatId}:${messageId}:${body}`;
    if(w.bridge.some(e=>e.sourceKey===key))return false;
    w.bridge.unshift({id:uid(),sourceKey:key,source:'chat',messageId,chatId,day:w.day,body:text(body,500),artistId:a.id,orderId:matches.length===1?matches[0].id:null,status:'pending'});return true;
}
export function applyCandidate(w,id,orderId){const e=w.bridge.find(e=>e.id===id);if(!e||e.status!=='pending')throw Error('事件已处理');const o=order(w,orderId);if(o.artistId!==e.artistId)throw Error('订单画师与角色不匹配');const v=placeholder(w,o.id,`来自聊天的稿件说明：${e.body}`);e.orderId=o.id;e.versionId=v.id;e.status='applied';record(w,'已确认聊天同步事件');return v;}
export function undoCandidate(w,id){const e=w.bridge.find(e=>e.id===id);if(!e||e.status!=='applied')throw Error('事件尚未应用');const o=order(w,e.orderId),v=o.versions.find(v=>v.id===e.versionId);if(o.status!=='review'||o.versions.at(-1)?.id!==v?.id||v.asset||v.positive||v.accepted)throw Error('稿件已被使用，无法直接撤销同步；原文件和交易记录已保留');o.versions.pop();o.status='working';o.paused=false;o.nextDay=w.day+1;const key=`${o.owner}:${o.artistId}`;w.messages[key]=(w.messages[key]||[]).filter(m=>m.versionId!==v.id);e.status='undone';record(w,'已撤销聊天稿件同步');}
export function injectSummary(w){const c=context();if(!c?.setExtensionPrompt)return;const ch=currentCharacter();const a=w.artists.filter(a=>a.linked?.avatar===ch?.avatar);const ids=new Set(a.map(a=>a.id));const orders=w.commissions.filter(o=>ids.has(o.artistId));const summary=w.settings.inject&&w.settings.bridgeEnabled&&a.length?`[绘约平台，剧情日 ${w.day}；以下为已确认平台状态，保持角色一致。${orders.slice(-5).map(o=>`${o.title}：${o.status}，${['草稿','线稿','上色','成稿'][o.stage]}，${o.price} 绘币，最近修改：${o.lastRevision||'无'}`).join('；')}。最近事件：${w.events.slice(-5).map(e=>e.message).join('；')}]`:'';c.setExtensionPrompt('huiyue-state',summary.slice(0,1800),1,1,false,0);}
