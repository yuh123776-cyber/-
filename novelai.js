import {extraParams,headers,request,imageBlob} from './relay.js?v=1.3.1';
import {zipImage} from './zip-image.js?v=1.3.1';
export const naiModels=['nai-diffusion-3','nai-diffusion-furry-3','nai-diffusion-4-full','nai-diffusion-4-curated-preview','nai-diffusion-4-5-full','nai-diffusion-4-5-curated','nai-diffusion-5-full','nai-diffusion-5-curated'];
export function novelAIRequest(settings,v,prompt) {
    for(const size of [settings.width,settings.height])if(!Number.isInteger(size)||size<64||size%64)throw Error('NAI 宽高必须为 64 的整数倍');
    const extra=extraParams(settings.extraParams),custom=extra.parameters||{};
    if(!custom||typeof custom!=='object'||Array.isArray(custom))throw Error('NAI parameters 必须为对象');
    if('action' in extra||['n_samples','seed','width','height','steps','scale','negative_prompt','v4_prompt','v4_negative_prompt'].some(k=>k in custom))throw Error('NAI 数量、提示词、种子与绘图参数请使用对应配置项，附加参数不能覆盖');
    const parameters={params_version:/nai-diffusion-5/.test(settings.model)?4:3,width:settings.width,height:settings.height,scale:settings.cfg,sampler:settings.naiSampler||'k_euler_ancestral',steps:settings.steps,seed:v.seed,n_samples:1,ucPreset:0,qualityToggle:false,sm:false,sm_dyn:false,dynamic_thresholding:false,controlnet_strength:1,legacy:false,add_original_image:true,cfg_rescale:0,noise_schedule:settings.naiNoise||'karras',...custom,negative_prompt:v.negative||''};
    if(/nai-diffusion-[45]/.test(settings.model)){
        parameters.v4_prompt={caption:{base_caption:prompt,char_captions:[]},use_coords:false,use_order:true};
        parameters.v4_negative_prompt={caption:{base_caption:v.negative||'',char_captions:[]},legacy_uc:false};
    }
    return {...extra,input:prompt,model:settings.model,action:'generate',parameters};
}
export async function novelAIBlob(url,settings,key,body,signal) {
    const response=await request(url,{method:'POST',headers:{...headers(settings,key,true),Accept:'application/x-zip-compressed, application/zip, application/json, image/png'},body:JSON.stringify(body),signal});
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.length>50*1024*1024)throw Error('NAI 返回文件过大');
    if(bytes[0]===0x50&&bytes[1]===0x4b)return zipImage(bytes,signal);
    if(bytes[0]===0x89&&bytes[1]===0x50)return new Blob([bytes],{type:'image/png'});
    if(bytes[0]===0xff&&bytes[1]===0xd8)return new Blob([bytes],{type:'image/jpeg'});
    let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{throw Error('NAI 未返回有效图片、ZIP 或 JSON，请检查中转地址与协议');}
    if(data?.error||data?.status==='failed')throw Error('NAI 中转返回错误，请检查密钥、额度和模型权限');
    return imageBlob(data,url,signal);
}
