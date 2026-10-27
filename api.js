import {novelAIRequest,novelAIBlob} from './novelai.js?v=1.3.0';
import * as R from './relay.js?v=1.3.0';
export {validateRelay} from './relay.js?v=1.3.0';
import {putAsset} from './storage.js?v=1.3.0';
import {textInstructions,imageInstructions} from './instructions.js?v=1.3.0';
export const context=()=>globalThis.SillyTavern?.getContext?.()||null;
const keys={};
const adapters=new Map();
let tavernQueue=Promise.resolve();
export function registerImageAdapter(adapter){if(!adapter||!/^custom-[a-z0-9-]+$/.test(adapter.id)||typeof adapter.generate!=='function'||typeof adapter.label!=='string')throw Error('适配器需要 custom- 开头的 ID、label 和 generate 函数');adapters.set(adapter.id,adapter);}
export function imageAdapters(){return [...adapters.values()].map(({id,label})=>({id,label}));}
export function setKey(kind,value){keys[kind]=value;}
export function hasKey(kind){return !!keys[kind];}
export async function listModels(settings,kind,signal,key=''){
    if(!['chat','prompt','image'].includes(kind))throw Error('未知 API 配置');
    if(!settings.url?.trim())throw Error('请先填写 API 根地址（含 /v1）');
    const data=await R.requestJSON(R.endpoint(settings,'models'),{headers:R.headers(settings,key||keys[kind]),signal});
    return R.modelIds(data);
}
async function checked(response){if(!response.ok)throw Error(`API 请求失败（HTTP ${response.status}），请检查地址、模型和密钥`);return response;}
export function parseJSON(s){const stripped=String(s).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,'');try{return JSON.parse(stripped);}catch{throw Error('AI 返回的不是有效 JSON，请重试或手动填写');}}
export async function complete(settings,kind,messages,signal){
    if(settings.mode==='tavern'){
        const c=context();if(!c?.generateRaw)throw Error('当前不在 SillyTavern 中，请在酒馆内使用或配置独立 API');
        const request=()=>{if(signal?.aborted)throw Error('已放弃本次结果');return c.generateRaw({prompt:messages,systemPrompt:textInstructions(settings,kind),responseLength:kind==='prompt'?700:900});};
        const pending=tavernQueue.catch(()=>{}).then(request);tavernQueue=pending;const result=await pending;
        if(signal?.aborted)throw Error('已放弃本次结果');return result;
    }
    const data=await R.requestJSON(R.endpoint(settings,'text'),{method:'POST',headers:R.headers(settings,keys[kind],true),body:JSON.stringify(R.textRequest(settings,textInstructions(settings,kind),messages)),signal});
    return R.textContent(data);
}
export async function draw(settings,v,signal){
    const sentPrompt=imageInstructions(settings,v.positive);
    const params={...settings,seed:v.seed,positive:v.positive,negative:v.negative,sentPrompt};let blob;
    if(adapters.has(settings.mode)){
        const result=await adapters.get(settings.mode).generate({positive:sentPrompt,instructions:settings.instructions||'',negative:v.negative,seed:v.seed,settings:structuredClone(settings),key:keys.image||'',signal});
        blob=result instanceof Blob?result:result?.blob;
        if(!(blob instanceof Blob))throw Error('自定义适配器没有返回图片 Blob');
        params.note='自定义适配器：'+settings.mode;
        if(result?.parameters)params.provider=result.parameters;
    }else if(settings.mode==='tavern'){
        const c=context(),cmd=c?.SlashCommandParser?.commands?.imagine;
        if(!cmd?.callback)throw Error('请先启用并配置酒馆自带的 Image Generation 扩展');
        // Invoke the registered official command callback directly. Never parse model text as STscript.
        const url=await cmd.callback({_abortController:signal,quiet:'true',extend:'false',edit:'false',gallery:'false',seed:String(v.seed),width:String(settings.width),height:String(settings.height),steps:String(settings.steps),cfg:String(settings.cfg),negative:v.negative},sentPrompt);
        if(signal?.aborted)throw Error('已放弃本次结果（远端生成可能仍在计费）');
        if(!url)throw Error('图片生成未返回文件，请检查酒馆图片扩展的连接状态');
        const u=new URL(url,location.href);if(u.origin!==location.origin)throw Error('酒馆返回了外部图片地址，请手动下载后上传');
        blob=await (await checked(await fetch(u,{signal}))).blob();params.note='使用酒馆 Image Generation 当前来源；实际模型和参考图能力由酒馆设置决定。';
    }else if(settings.imageProtocol==='novelai'){
        const url=R.endpoint(settings,'image');
        blob=await novelAIBlob(url,settings,keys.image,novelAIRequest(settings,v,sentPrompt),signal);
        params.note='NovelAI 原生中转；发送独立正反向词、种子、尺寸、步数及 CFG，原始图片解包后保存。';
    }else{
        const url=R.endpoint(settings,'image');
        const body=R.imageRequest(settings,sentPrompt+(v.negative?'\nNegative prompt: '+v.negative:''));
        const data=await R.requestJSON(url,{method:'POST',headers:R.headers(settings,keys.image,true),body:JSON.stringify(body),signal});
        blob=await R.imageBlob(data,url,signal);
        params.note='中转兼容接口（'+(settings.imageProtocol==='chat'?'聊天式生图':'Images')+'）；仅发送一次生成请求，seed/steps/cfg 等能力由服务决定。';
    }
    if(signal?.aborted)throw Error('已放弃本次结果');
    const ext={'image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[blob.type]||'png';
    return {asset:await putAsset(blob,`${v.stage}-V${v.number}.${ext}`),params};
}
