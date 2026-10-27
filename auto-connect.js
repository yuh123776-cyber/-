import {apiBase,endpoint,modelIds} from './relay.js?v=1.4.0';
import {relayPresets} from './relay-presets.js?v=1.4.0';
import {naiModels} from './novelai.js?v=1.4.0';

export const connectionFields=['apiAuth','modelsPath','requestPath','extraParams','textProtocol','imageProtocol','imageResponse','imageSizeMode','imageModalities','naiSampler','naiNoise'];
const defaults={apiAuth:'bearer',modelsPath:'',requestPath:'',extraParams:'',textProtocol:'chat',imageProtocol:'images',imageResponse:'auto',imageSizeMode:'default',imageModalities:'text-image',naiSampler:'k_euler_ancestral',naiNoise:'karras'};
export function automaticProfile(value,kind){
    const clean=apiBase(value,true),u=new URL(clean),path=u.pathname.replace(/\/+$/,'');
    let id;
    if(kind==='image'){
        if(u.host==='tang.iisbo.com'&&(!path||path.startsWith('/novelai')))id='tang-nai';
        else if(u.host==='api.rinko.ai'&&(!path||path==='/nai'||path.startsWith('/nai/')))id='rinko-nai';
        else if(u.host==='ynai.rinko.ai')id='ynai-rinko';
        else if(u.host==='nai.rinko.ai')id='nai-rinko';
    }
    if(!id&&(!path||path==='/v1')){
        if(u.host==='api.rinko.ai')id='rinko';
        if(kind!=='image'&&u.host==='gcli.ggchan.dev')id='gcli';
    }
    if(id){
        const preset=relayPresets[id],settings={...defaults,...preset.values};
        delete settings.model;
        if(kind==='image'&&path.endsWith('/ai/generate-image'))settings.requestPath=path;
        return {settings,label:preset.label,known:true,reference:kind==='image'&&['tang-nai','rinko-nai'].includes(id)};
    }
    const native=kind==='image'&&(/\/ai\/generate-image$/.test(path)||/\/v1\/nai\/generate-image$/.test(path));
    const settings={...defaults,url:native?u.origin:apiBase(value)};
    if(native){settings.imageProtocol='novelai';settings.requestPath=path;settings.modelsPath='/v1/models';}
    else if(kind!=='image'&&/\/responses\/?$/.test(String(value).trim()))settings.textProtocol='responses';
    else if(kind==='image'&&/\/chat\/completions\/?$/.test(String(value).trim()))settings.imageProtocol='chat';
    return {settings,label:native?'NovelAI 兼容站点':'通用兼容站点',known:native,reference:false};
}
function entries(data){return Array.isArray(data)?data:Array.isArray(data?.data)?data.data:data?.models??data?.data?.models??data?.data?.data??[];}
function modelSettings(base,entry,kind,known){
    const settings={...base};if(known||!entry||typeof entry==='string')return settings;
    const raw=entry.supported_endpoint_types??entry.supported_endpoints??entry.endpoints??[];
    const types=(Array.isArray(raw)?raw:[raw]).map(x=>typeof x==='string'?x:x?.type).filter(Boolean).map(x=>x.toLowerCase().replace(/^\/?v1\//,'').replace(/^\//,''));
    if(kind!=='image'){
        if(types.some(t=>['responses','openai-response','openai-responses'].includes(t))&&!types.some(t=>['openai','chat','chat/completions'].includes(t))){settings.textProtocol='responses';if(settings.requestPath?.endsWith('/chat/completions'))settings.requestPath=settings.requestPath.replace(/\/chat\/completions$/,'/responses');}
    }else if(!types.some(t=>['image-generation','images','images/generations','openai-image'].includes(t))&&types.some(t=>['openai','chat','chat/completions'].includes(t))&&entry.architecture?.output_modalities?.includes('image')){
        settings.imageProtocol='chat';settings.requestPath='';
    }
    return settings;
}
// Discovery performs GET requests only, to the exact origin supplied by the user.
// A model list confirms discovery/auth, never a successful paid generation.
export async function discoverConnection(value,kind,readModels,signal){
    const profile=automaticProfile(value,kind),initial=profile.settings,origin=new URL(initial.url).origin;
    const candidates=[initial];
    if(!profile.known){
        const base=apiBase(value),u=new URL(base),prefix=u.pathname.replace(/\/+$/,'');
        for(const path of [prefix.endsWith('/v1')?prefix.replace(/\/v1$/,'')+'/models':prefix+'/v1/models','/api/v1/models','/models']){
            if(candidates.length>=3)break;
            const candidate={...initial,modelsPath:path};
            if(!candidates.some(c=>endpoint(c,'models')===endpoint(candidate,'models')))candidates.push(candidate);
        }
    }
    let lastError;
    for(const candidate of candidates){
        signal?.throwIfAborted();
        if(new URL(endpoint(candidate,'models')).origin!==origin)throw Error('自动识别不能向其他站点发送密钥');
        const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);
        signal?.addEventListener('abort',abort,{once:true});
        const timer=setTimeout(()=>controller.abort(),5000);
        try{
            const data=await readModels(candidate,controller.signal);signal?.throwIfAborted();
            const models=modelIds(data),byId=new Map(entries(data).map(e=>[typeof e==='string'?e:e?.id??e?.name??e?.model,e]));
            let resolved={...candidate};
            if(!profile.known&&candidate.modelsPath){
                const path=new URL(endpoint(candidate,'models')).pathname.replace(/\/models$/,'');
                resolved.url=origin+path;resolved.modelsPath=candidate.modelsPath;
                if(!path)resolved.requestPath=kind==='image'?'/images/generations':'/chat/completions';
            }
            const configurations=Object.fromEntries(models.map(id=>[id,modelSettings(resolved,byId.get(id),kind,profile.known&&initial.imageProtocol==='novelai')]));
            return {models,configurations,label:profile.label,verified:true};
        }catch(error){
            signal?.throwIfAborted();lastError=controller.signal.aborted?Error('模型列表读取超时，请检查站点 URL 和网络后重试'):error;
            if([401,403,429].includes(error.status))throw error;
        }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    }
    if(profile.reference&&([404,405].includes(lastError?.status)||['invalid-json','model-format'].includes(lastError?.code))){
        return {models:naiModels,configurations:Object.fromEntries(naiModels.map(id=>[id,{...initial}])),label:profile.label,verified:false};
    }
    throw lastError||Error('无法识别该站点，请检查站点 URL 和密钥');
}
