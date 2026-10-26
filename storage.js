import {validateWorld, uid} from './core.js?v=1.2.0';
const DB='huiyue-v1'; let db;
export async function openDB(){if(db)return db;db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{r.result.createObjectStore('worlds',{keyPath:'id'});r.result.createObjectStore('assets',{keyPath:'id'});};r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();db=undefined;};resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('本地数据库被另一个页面占用，请关闭其他酒馆标签页后重试'));});return db;}
async function transact(stores,mode,action){const d=await openDB();return new Promise((resolve,reject)=>{const t=d.transaction(stores,mode);let result;action(t,v=>result=v);t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('保存已取消'));});}
export async function loadWorld(id){return transact(['worlds'],'readonly',(t,set)=>{const r=t.objectStore('worlds').get(id);r.onsuccess=()=>set(r.result);});}
export async function saveWorld(w){validateWorld(w);await transact(['worlds'],'readwrite',t=>t.objectStore('worlds').put(structuredClone(w)));}
export async function getAsset(id){if(!id)return null;return transact(['assets'],'readonly',(t,set)=>{const r=t.objectStore('assets').get(id);r.onsuccess=()=>set(r.result);});}
export async function putAsset(blob,name='稿件.png'){
    if(!(blob instanceof Blob)||!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(blob.type))throw Error('请选择 PNG、JPG、WebP、GIF、AVIF 或 BMP 图片');
    if(blob.size>40*1024*1024)throw Error('单张图片请小于 40 MB');
    if(!blob.size)throw Error('图片文件为空');
    // Decode without recompressing; the stored bytes stay identical to the uploaded file.
    const check=URL.createObjectURL(blob);try{await new Promise((resolve,reject)=>{const i=new Image();i.onload=resolve;i.onerror=()=>reject(Error('无法读取这张图片'));i.src=check;});}finally{URL.revokeObjectURL(check);}
    const asset={id:uid(),blob,name,size:blob.size,type:blob.type};await transact(['assets'],'readwrite',t=>t.objectStore('assets').put(asset));return asset.id;
}
export function download(blob,name){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);}
export async function downloadAsset(id){const a=await getAsset(id);if(!a)throw Error('图片原文件不存在，请恢复包含图片的存档');download(a.blob,a.name);}
export function assetIds(w){const ids=new Set();function walk(v){if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(['asset','avatar','background','launcherAsset'].includes(k)&&typeof x==='string'&&x)ids.add(x);else if(typeof x==='object')walk(x);}}walk(w);return [...ids];}
const base64=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
export async function exportWorld(w){const assets=[];for(const id of assetIds(w)){const a=await getAsset(id);if(!a)throw Error('存在丢失的图片，无法制作完整存档');assets.push({id,name:a.name,type:a.type,data:await base64(a.blob)});}download(new Blob([JSON.stringify({format:'huiyue-bundle',version:1,world:w,assets})],{type:'application/json'}),`绘约-剧情日${w.day}-完整存档.json`);}
export async function importWorld(file,targetId){
    if(file.size>300*1024*1024)throw Error('存档过大，请控制在 300 MB 内');
    const bundle=JSON.parse(await file.text());if(bundle.format!=='huiyue-bundle'||bundle.version!==1||!Array.isArray(bundle.assets))throw Error('不是绘约完整存档');
    const w=validateWorld(bundle.world);w.id=targetId;const map=new Map(),assets=[];
    // Remap IDs to prevent an imported archive from overwriting another world's assets.
    for(const a of bundle.assets){if(typeof a.id!=='string'||map.has(a.id)||!/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(a.type))throw Error('存档图片格式错误');const bytes=Uint8Array.from(atob(a.data),c=>c.charCodeAt(0));const id=uid();map.set(a.id,id);assets.push({id,name:String(a.name||'稿件.png'),type:a.type,blob:new Blob([bytes],{type:a.type}),size:bytes.length});}
    for(const id of assetIds(w))if(!map.has(id))throw Error('存档缺少图片原文件');
    function remap(v){if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){if(['asset','avatar','background','launcherAsset'].includes(k)&&typeof x==='string'&&x)v[k]=map.get(x);else if(typeof x==='object')remap(x);}}remap(w);
    for(const o of w.commissions)for(const v of o.versions)if(['prompting','drawing'].includes(v.status)){v.status=v.asset?'ready':v.positive?'prompted':'empty';v.error=null;}
    await transact(['worlds','assets'],'readwrite',t=>{for(const a of assets)t.objectStore('assets').put(a);t.objectStore('worlds').put(w);});return w;
}
