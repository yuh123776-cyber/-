import {putAsset} from './storage.js?v=1.1.0';
export const context=()=>globalThis.SillyTavern?.getContext?.()||null;
const keys={};
const adapters=new Map();
let tavernQueue=Promise.resolve();
export function registerImageAdapter(adapter){if(!adapter||!/^custom-[a-z0-9-]+$/.test(adapter.id)||typeof adapter.generate!=='function'||typeof adapter.label!=='string')throw Error('适配器需要 custom- 开头的 ID、label 和 generate 函数');adapters.set(adapter.id,adapter);}
export function imageAdapters(){return [...adapters.values()].map(({id,label})=>({id,label}));}
export function setKey(kind,value){keys[kind]=value;}
export function hasKey(kind){return !!keys[kind];}
function endpoint(base,path){const u=new URL(base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('API 地址必须是 HTTP(S)，请勿在地址中填写密钥');return base.replace(/\/+$/,'')+path;}
async function checked(response){if(!response.ok)throw Error(`API 请求失败（HTTP ${response.status}），请检查地址、模型和密钥`);return response;}
export function parseJSON(s){const stripped=String(s).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'');try{return JSON.parse(stripped);}catch{throw Error('AI 返回的不是有效 JSON，请重试或手动填写');}}
export async function complete(settings,kind,messages,signal){
    if(settings.mode==='tavern'){
        const c=context();if(!c?.generateRaw)throw Error('当前不在 SillyTavern 中，请在酒馆内使用或配置独立 API');
        const request=()=>{if(signal?.aborted)throw Error('已放弃本次结果');return c.generateRaw({prompt:messages,systemPrompt:settings.template||'',responseLength:kind==='prompt'?700:900});};
        const pending=tavernQueue.catch(()=>{}).then(request);tavernQueue=pending;const result=await pending;
        if(signal?.aborted)throw Error('已放弃本次结果');return result;
    }
    const result=await checked(await fetch(endpoint(settings.url,'/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json',...(keys[kind]?{Authorization:`Bearer ${keys[kind]}`}:{})},body:JSON.stringify({model:settings.model,messages:[{role:'system',content:settings.template||''},...messages],stream:false}),signal}));
    const data=await result.json();const content=data.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw Error('API 没有返回文本内容');return content;
}
export async function draw(settings,v,signal){
    const params={...settings,seed:v.seed,positive:v.positive,negative:v.negative};let blob;
    if(adapters.has(settings.mode)){
        const result=await adapters.get(settings.mode).generate({positive:v.positive,negative:v.negative,seed:v.seed,settings:structuredClone(settings),key:keys.image||'',signal});
        blob=result instanceof Blob?result:result?.blob;
        if(!(blob instanceof Blob))throw Error('自定义适配器没有返回图片 Blob');
        params.note='自定义适配器：'+settings.mode;
        if(result?.parameters)params.provider=result.parameters;
    }else if(settings.mode==='tavern'){
        const c=context(),cmd=c?.SlashCommandParser?.commands?.imagine;
        if(!cmd?.callback)throw Error('请先启用并配置酒馆自带的 Image Generation 扩展');
        // Invoke the registered official command callback directly. Never parse model text as STscript.
        const url=await cmd.callback({_abortController:signal,quiet:'true',extend:'false',edit:'false',gallery:'false',seed:String(v.seed),width:String(settings.width),height:String(settings.height),steps:String(settings.steps),cfg:String(settings.cfg),negative:v.negative},v.positive);
        if(signal?.aborted)throw Error('已放弃本次结果（远端生成可能仍在计费）');
        if(!url)throw Error('图片生成未返回文件，请检查酒馆图片扩展的连接状态');
        const u=new URL(url,location.href);if(u.origin!==location.origin)throw Error('酒馆返回了外部图片地址，请手动下载后上传');
        blob=await (await checked(await fetch(u,{signal}))).blob();params.note='使用酒馆 Image Generation 当前来源；实际模型和参考图能力由酒馆设置决定。';
    }else{
        const r=await checked(await fetch(endpoint(settings.url,'/images/generations'),{method:'POST',headers:{'Content-Type':'application/json',...(keys.image?{Authorization:`Bearer ${keys.image}`}:{})},body:JSON.stringify({model:settings.model,prompt:v.positive+(v.negative?'\nNegative prompt: '+v.negative:''),size:`${settings.width}x${settings.height}`,n:1,response_format:'b64_json'}),signal}));
        const data=await r.json(),entry=data.data?.[0];
        if(entry?.b64_json){blob=new Blob([Uint8Array.from(atob(entry.b64_json),c=>c.charCodeAt(0))],{type:'image/png'});}
        else if(entry?.url){const u=new URL(entry.url);if(u.protocol!=='https:'&&u.protocol!=='http:')throw Error('返回的图片地址无效');blob=await(await checked(await fetch(u,{signal,credentials:'omit'}))).blob();}
        else throw Error('API 没有返回图片');
        params.note='OpenAI 兼容图片接口；seed/steps/cfg 仅保留为参考，不保证服务支持。未调用局部重绘。';
    }
    if(signal?.aborted)throw Error('已放弃本次结果');
    const ext={'image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[blob.type]||'png';
    return {asset:await putAsset(blob,`${v.stage}-V${v.number}.${ext}`),params};
}
