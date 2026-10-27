import {relayPresets} from './relay-presets.js?v=1.3.0';
import {naiModels} from './novelai.js?v=1.3.0';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function relayFields(kind,s) {
    const select=(key,label,items,defaultValue)=>`<label>${label}<select name="${kind}.${key}">${items.map(([value,title])=>`<option value="${value}" ${(s[key]||defaultValue)===value?'selected':''}>${title}</option>`).join('')}</select></label>`;
    const input=(key,label,placeholder)=>`<label>${label}<input name="${kind}.${key}" value="${escape(s[key])}" placeholder="${placeholder}"></label>`;
    return `<label>中转站预设（可选，选后检查地址及模型）<select data-relay-preset><option value="">选择预设，不会自动请求</option>${Object.entries(relayPresets).filter(([,p])=>p.kinds.includes(kind)).map(([id,p])=>`<option value="${id}">${p.label}</option>`).join('')}</select></label><details><summary>中转站兼容设置（按站点文档调整）</summary><div class="hy-form">
        ${kind==='image'?select('imageProtocol','生图接口协议',[['images','Images 标准生图接口'],['chat','Chat Completions 聊天式生图'],['novelai','NovelAI 原生（含 NAI 中转）']],'images'):select('textProtocol','文本接口协议',[['chat','Chat Completions（常见中转站）'],['responses','Responses']],'chat')}
        ${select('apiAuth','API Key 鉴权方式',[['bearer','Authorization: Bearer（默认）'],['x-api-key','x-api-key 请求头'],['api-key','api-key 请求头']],'bearer')}
        ${input('modelsPath','模型列表路径（留空使用 models）','例如 models 或 /api/v1/images/models')}
        ${input('requestPath',kind==='image'?'生图请求路径（留空按协议自动选择）':'文本请求路径（留空按协议自动选择）',kind==='image'?'例如 images/generations 或 /api/v1/images':'例如 chat/completions 或 responses')}
        <p class="hy-muted">相对路径接在 API 根地址后；以 / 开头则从站点根目录开始。鉴权方式仅改变请求头，不代表启用 Claude/Gemini 原生协议。</p>
        ${kind==='image'?select('imageResponse','Images 返回格式',[['auto','由服务决定（不发送 response_format）'],['b64_json','Base64（图片地址无法下载时可尝试）'],['url','图片 URL']],'auto')+select('imageSizeMode','Images 尺寸参数',[['custom','发送下方绘图宽高'],['default','由服务决定（不发送 size）'],['auto','发送 size: auto']],'custom')+select('imageModalities','聊天式生图输出类型',[['text-image','text + image'],['image','仅 image'],['omit','由服务决定（不发送 modalities）']],'text-image')+select('naiSampler','NAI 采样器',[['k_euler_ancestral','Euler Ancestral'],['k_euler','Euler'],['k_dpmpp_2m','DPM++ 2M'],['k_dpmpp_2m_sde','DPM++ 2M SDE'],['ddim_v3','DDIM']],'k_euler_ancestral')+select('naiNoise','NAI 噪声调度',[['karras','karras'],['native','native'],['exponential','exponential'],['polyexponential','polyexponential']],'karras')+`<label>常用 NAI 模型（本地参考列表，并非站点实时列表）<select data-nai-model><option value="">选择或在模型名中手动填写</option>${naiModels.map(id=>`<option value="${id}">${id}</option>`).join('')}</select></label><p class="hy-muted">NAI 使用独立正反向词、种子、步数和 CFG；宽高须为 64 的整数倍。模型可用性由中转站决定；无模型列表接口的 NAI 站点可使用本地参考或手动填写。聊天式生图与 Images 参数只作用于各自协议。</p>`:''}
        <label>附加请求参数（JSON，可留空）<textarea name="${kind}.extraParams" rows="4" maxlength="10000" placeholder='${kind==='image'?'例如 {"quality":"high"}':'例如 {"temperature":0.7}'}'>${escape(s.extraParams)}</textarea></label>
        <p class="hy-muted">用于站点要求的 quality、aspect_ratio、image_config、max_tokens 等参数，会随设置和存档保存，请勿填写密钥。不能覆盖模型、提示词、消息、流式开关和图片数量。生成失败不会自动切换协议或重试。</p>
    </div></details>`;
}
