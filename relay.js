// Shared wire formats for OpenAI-compatible relays. No provider or model names are guessed.
export function apiBase(value,native=false) {
    let url;try{url=new URL(String(value||'').trim());}catch{throw Error('请填写有效的 API 地址，例如 https://example.com/v1');}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('API 地址必须是 HTTP(S)，不要在地址中填写密钥、查询参数或片段');
    url.pathname=url.pathname.replace(/\/+$/,'').replace(/\/(?:chat\/completions|images\/generations|responses|models)$/,'');
    if(!native&&(!url.pathname||url.pathname==='/'))url.pathname='/v1';
    return url.href.replace(/\/+$/,'');
}
export function endpoint(settings,kind) {
    const nai=settings.imageProtocol==='novelai',base=apiBase(settings.url,nai);
    if(kind==='image'&&nai&&(!settings.requestPath||settings.requestPath==='ai/generate-image')&&/\/ai\/generate-image$/.test(base))return base;
    const fallback=kind==='models'?'models':kind==='text'?(settings.textProtocol==='responses'?'responses':'chat/completions'):(nai?'ai/generate-image':settings.imageProtocol==='chat'?'chat/completions':'images/generations');
    const path=String((kind==='models'?settings.modelsPath:settings.requestPath)||fallback).trim();
    if(!path||/[?#\\]/.test(path)||path.startsWith('//')||/^[a-z][a-z0-9+.-]*:/i.test(path)||path.split('/').some(part=>['.','..'].includes(decodeURIComponent(part))))throw Error('接口路径应为站内路径，例如 models、images 或 /api/v1/images，不含域名和查询参数');
    const target=new URL(path.startsWith('/')?path:base+'/'+path,base);
    if(target.origin!==new URL(base).origin)throw Error('接口路径必须与 API 地址同站');
    return target.href;
}
export function headers(settings,key='',json=false) {
    const auth=settings.apiAuth||'bearer';
    if(!['bearer','x-api-key','api-key'].includes(auth))throw Error('不支持的 API 鉴权方式');
    return {Accept:'application/json',...(json?{'Content-Type':'application/json'}:{}),...(key?{[auth==='bearer'?'Authorization':auth]:auth==='bearer'?`Bearer ${key}`:key}:{})};
}
export function extraParams(value) {
    if(!value?.trim())return {};
    let data;try{data=JSON.parse(value);}catch{throw Error('附加请求参数必须是有效 JSON 对象');}
    if(!data||typeof data!=='object'||Array.isArray(data))throw Error('附加请求参数必须是 JSON 对象');
    const inspect=object=>{for(const [key,value] of Object.entries(object)){
        if(/^(?:__proto__|constructor|prototype|authorization|api[-_]?key|token|access_token|secret|headers)$/i.test(key))throw Error('密钥只能填写在 API Key 框中，不能放入附加参数');
        if(value&&typeof value==='object')inspect(value);
    }};inspect(data);
    for(const key of ['model','messages','prompt','input','instructions','stream','n'])if(key in data)throw Error(`附加参数不能覆盖 ${key}，请使用对应配置项`);
    return data;
}
export function validateRelay(settings,kind) {
    endpoint(settings,'models');endpoint(settings,kind==='image'?'image':'text');headers(settings);extraParams(settings.extraParams);
    if(kind==='image'&&!['images','chat','novelai'].includes(settings.imageProtocol||'images'))throw Error('不支持的生图协议');
    if(kind!=='image'&&!['chat','responses'].includes(settings.textProtocol||'chat'))throw Error('不支持的文本协议');
}
export function modelIds(data) {
    const entries=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:data?.models??data?.data?.models??data?.data?.data;
    if(!Array.isArray(entries))throw Object.assign(Error('服务返回的模型列表格式不受支持'),{code:'model-format'});
    const ids=[...new Set(entries.map(item=>typeof item==='string'?item:item?.id??item?.name??item?.model).filter(id=>typeof id==='string'&&id.trim()&&id.length<=1000))].sort();
    if(!ids.length)throw Error('服务没有返回可用模型，请检查密钥权限或手动填写模型名');
    return ids;
}
export function textContent(data) {
    const content=data?.choices?.[0]?.message?.content;
    const text=typeof content==='string'?content:Array.isArray(content)?content.filter(p=>p.type==='text'||p.type==='output_text').map(p=>p.text||'').join(''):typeof data?.output_text==='string'?data.output_text:(data?.output||[]).filter(p=>p.type==='message').flatMap(p=>p.content||[]).filter(p=>p.type==='output_text').map(p=>p.text||'').join('');
    if(typeof text!=='string'||!text.trim())throw Error('API 没有返回文本内容，请确认所选模型支持文本输出及当前接口协议');
    return text;
}
export function textRequest(settings,system,messages) {
    const extra=extraParams(settings.extraParams);
    return settings.textProtocol==='responses'?{...extra,model:settings.model,instructions:system,input:messages,stream:false}:{...extra,model:settings.model,messages:[{role:'system',content:system},...messages],stream:false};
}
export function imageRequest(settings,prompt) {
    const extra=extraParams(settings.extraParams);
    if(settings.imageProtocol==='chat')return { ...(settings.imageModalities==='omit'?{}:{modalities:settings.imageModalities==='image'?['image']:['text','image']}),...extra,model:settings.model,messages:[{role:'user',content:prompt}],stream:false};
    const sizeMode=settings.imageSizeMode||'custom',format=settings.imageResponse||'auto';
    if(!['custom','default','auto'].includes(sizeMode)||!['auto','url','b64_json'].includes(format))throw Error('生图尺寸或返回格式设置无效');
    return {...(sizeMode==='custom'?{size:`${settings.width}x${settings.height}`}:sizeMode==='auto'?{size:'auto'}:{}),...(format==='auto'?{}:{response_format:format}),...extra,model:settings.model,prompt,n:1};
}
export async function request(url,options) {
    let response;
    try{response=await fetch(url,{...options,credentials:'omit',redirect:'error'});}catch(error){if(options.signal?.aborted)throw error;throw Error('API 连接失败，请检查地址、网络和中转站的浏览器跨域许可');}
    if(!response.ok){const error=Error(`API 请求失败（HTTP ${response.status}）：${response.status===401||response.status===403?'请检查中转站密钥、分组和模型权限':response.status===404?'请检查 API 地址和接口路径':response.status===429?'请求过于频繁或额度不足，请稍后检查':response.status===400||response.status===422?'请检查模型所需协议、尺寸和附加参数':'请检查中转站状态和模型支持情况'}`);error.status=response.status;throw error;}
    return response;
}
export async function requestJSON(url,options) {
    const response=await request(url,options);
    let data;try{data=await response.json();}catch{throw Object.assign(Error('API 未返回 JSON，请检查站点 URL 是否正确'),{code:'invalid-json'});}
    if(data?.error||data?.success===false||data?.status==='failed')throw Error('中转站返回错误，请检查模型权限、余额和接口参数；本次没有自动重试');
    return data;
}
function imageEntry(data) {
    if(typeof data==='string')return /^(?:https?:|data:|\/)/.test(data)?{url:data}:{b64_json:data};
    if(data?.url||data?.b64_json)return data;
    const entry=(Array.isArray(data)?data[0]:undefined)??data?.data?.[0]??data?.data?.data?.[0]??data?.images?.[0];
    if(typeof entry==='string')return /^(?:https?:|data:|\/)/.test(entry)?{url:entry}:{b64_json:entry};
    if(entry?.image)return {b64_json:entry.image};
    if(entry?.b64_json||entry?.url||entry?.image_url)return entry;
    const message=data?.choices?.[0]?.message;
    const image=message?.images?.[0];
    if(image)return typeof image==='string'?{url:image}:image;
    if(Array.isArray(message?.content)){
        const part=message.content.find(p=>p.type==='image_url'||p.type==='image'||p.type==='output_image');
        if(part)return part;
    }
    if(typeof message?.content==='string'){
        const match=message.content.match(/!\[[^\]]*\]\(\s*(<?(?:https?:\/\/|data:image\/)[^\s]+?>?)\s*\)/i);
        if(match)return {url:match[1].replace(/^<|>$/g,'')};
    }
    throw Error('API 没有返回图片，请核对生图协议和模型是否支持图片输出；异步任务接口需专用适配器');
}
export async function imageBlob(data,requestUrl,signal) {
    const entry=imageEntry(data),source=entry.url||entry.image_url?.url||entry.image_url;
    const inline=typeof source==='string'?source.match(/^data:(image\/(?:png|jpeg|webp|gif|avif|bmp));base64,([\s\S]+)$/i):null;
    const encoded=entry.b64_json||inline?.[2];
    if(encoded){
        let bytes;try{bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));}catch{throw Error('API 返回的图片 Base64 无效');}
        const detected=bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':bytes[0]===0x52&&bytes[8]===0x57?'image/webp':bytes[0]===0x47&&bytes[1]===0x49?'image/gif':bytes[0]===0x42&&bytes[1]===0x4d?'image/bmp':bytes[4]===0x66&&bytes[8]===0x61?'image/avif':'image/png';
        return new Blob([bytes],{type:entry.media_type||entry.mime_type||inline?.[1]||detected});
    }
    if(typeof source!=='string'||!source.trim())throw Error('API 返回的图片地址无效');
    let url;try{url=new URL(source,requestUrl);}catch{throw Error('API 返回的图片地址无效');}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('API 返回了不支持的图片地址');
    let response;try{response=await fetch(url,{signal,credentials:'omit'});}catch(error){if(signal?.aborted)throw error;throw Error('图片已生成，但下载失败；请检查图片地址跨域设置，或改用 Base64 返回格式');}
    if(!response.ok)throw Error(`图片已生成，但下载失败（HTTP ${response.status}）；可改用 Base64 返回格式`);
    return response.blob();
}
