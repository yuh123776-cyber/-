import {context} from './api.js?v=1.5.0';
export function personaKey(){const c=context();return c?.chatMetadata?.persona||c?.name1||'local-user';}
export function relationshipContext(artist){
    const c=context(),current=c?.characters?.[c.characterId],linked=artist?.linked;
    return {user:{name:c?.name1||'user',persona:String(c?.powerUserSettings?.persona_description||'').slice(0,9000)},character:linked?{...linked,...(current?.avatar===linked.avatar&&!linked.npc?{description:String(current.description||current.data?.description||linked.description||'').slice(0,12000),personality:String(current.personality||current.data?.personality||linked.personality||'').slice(0,5000)}:{})}:null,relationship:String(artist?.relationship||'').slice(0,4000),recentStory:linked&&current?.avatar===linked.avatar?(c.chat||[]).filter(m=>!m.is_system).slice(-6).map(m=>({name:m.name,user:!!m.is_user,text:String(m.mes||'').slice(0,2500)})):[]};
}
export function presetBenefits(artist){
    const relation=String(artist.relationship||'')+' '+String(artist.linked?.description||'');
    const fan=/(?:是|作为|身为).{0,8}(?:user|\{\{user\}\}|对方|委托人|我)\s*的粉丝/i.test(relation);
    return {discount:fan ? 0.9 : 1,gift:fan,reason:fan?'基于已关联关系，画师愿意给粉丝价并附赠一张图。':''};
}
export async function fullRelationshipContext(artist){
    const result=relationshipContext(artist),c=context();if(!c?.loadWorldInfo||!artist?.linked)return result;
    const ch=c.characters?.[c.characterId],books=new Set([artist.linked.world,ch?.avatar===artist.linked.avatar?ch.data?.extensions?.world:null,c.powerUserSettings?.persona_description_lorebook].filter(Boolean));
    const entries=[];
    for(const name of books){const book=await c.loadWorldInfo(name);for(const entry of Object.values(book?.entries||{})){if(entry.disable)continue;const content=String(entry.content||''),keys=JSON.stringify([entry.key,entry.comment]);if(content.includes(artist.name)||keys.includes(artist.name)||content.includes('{{user}}')||(c.name1&&content.includes(c.name1)))entries.push({book:name,title:entry.comment,content:content.slice(0,3000)});}}
    result.worldInfo=entries.slice(0,12);return result;
}
export function parseTermsReply(raw){
    let terms=null;
    const body=String(raw).replace(/\[\[HY_TERMS:(\{[^\r\n]*?\})\]\]/g,(_,json)=>{try{const data=JSON.parse(json),discount=data.discount===undefined?1:Number(data.discount);if(Number.isFinite(discount)&&discount>=.05&&discount<=1)terms={discount,gift:data.gift===true,reason:String(data.reason||'画师在私信中自愿提出的方案').slice(0,500)};}catch{}return '';});
    return {body,terms};
}
