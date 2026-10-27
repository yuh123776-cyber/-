import * as S from './storage.js?v=1.4.0';
import {uid} from './core.js?v=1.4.0';
import {connectionFields} from './auto-connect.js?v=1.4.0';
const kinds=['chat','prompt','image'];
let profiles=new Map(),loaded=false,queue=Promise.resolve();
const serial=action=>{const result=queue.catch(()=>{}).then(action);queue=result;return result;};
const scope=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.origin:'';}catch{return '';}};
export function connectionSnapshot(settings,kind){
    const fields=['mode','url','model',...connectionFields,...(kind==='image'?['width','height','steps','cfg']:[])];
    return Object.fromEntries(fields.filter(key=>settings[key]!==undefined).map(key=>[key,settings[key]]));
}
const publicProfile=p=>({id:p.id,kind:p.kind,name:p.name,settings:structuredClone(p.settings),hasKey:!!p.secret});
export async function loadProfiles(){
    return serial(async()=>{profiles=new Map((await S.readApiProfiles()).filter(p=>kinds.includes(p.kind)&&p.settings).map(p=>[p.id,p]));loaded=true;});
}
export function listProfiles(kind){return [...profiles.values()].filter(p=>p.kind===kind).map(publicProfile);}
export function getProfile(id,kind){const p=profiles.get(id);return p&&p.kind===kind?publicProfile(p):null;}
export function profileKey(id,kind,url){const p=profiles.get(id);return p&&p.kind===kind&&scope(url)&&scope(url)===scope(p.settings.url)?p.secret||'':'';}
export async function saveProfilesForSettings(settings,inputs){
    return serial(async()=>{
        if(!loaded)throw Error('API 配置尚未载入，请重新打开设置');
        const result=structuredClone(settings),records=[];
        for(const kind of kinds){
            const s=result[kind];if(s.mode==='tavern'||!s.url)continue;
            const input=inputs[kind]||{},previous=profiles.get(s.apiProfileId);
            const current=previous?.kind===kind?previous:null;
            const id=current?.id||uid();let name=String(input.name||'').trim().slice(0,100)||`${new URL(s.url).host} · ${s.model||'API'}`.slice(0,100);
            if(!current&&!String(input.name||'').trim()){const base=name;let number=2;while([...profiles.values(),...records].some(p=>p.kind===kind&&p.name===name))name=`${base} (${number++})`;}
            const secret=input.key?String(input.key):current&&scope(current.settings.url)===scope(s.url)?current.secret||'':'';
            records.push({id,kind,name,settings:connectionSnapshot(s,kind),secret,updatedAt:Date.now()});
            s.apiProfileId=id;
        }
        await S.writeApiProfiles(records);
        for(const record of records)profiles.set(record.id,record);
        return result;
    });
}
export async function clearProfileKey(id,kind){return serial(async()=>{
    const record=profiles.get(id);if(!record||record.kind!==kind)throw Error('请先选择已保存的 API');
    const next={...record,secret:'',updatedAt:Date.now()};await S.writeApiProfiles([next]);profiles.set(id,next);
});}
export async function removeProfile(id,kind){return serial(async()=>{
    const record=profiles.get(id);if(!record||record.kind!==kind)throw Error('请先选择已保存的 API');
    await S.deleteApiProfile(id);profiles.delete(id);
});}
