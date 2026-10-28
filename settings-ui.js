import {DEFAULT_DM_PRESET} from './instructions.js?v=1.5.0';
const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const area=(name,label,value='',rows=4)=>`<label>${E(label)}<textarea name="${name}" rows="${rows}" maxlength="10000">${E(value)}</textarea></label>`;
const select=(name,label,value,options)=>`<label>${E(label)}<select name="${name}">${options.map(([id,title])=>`<option value="${id}" ${id===value?'selected':''}>${title}</option>`).join('')}</select></label>`;
export function settingsNav(active='settings'){
    return `<nav class="hy-settings-tabs" aria-label="设置分类">${[['settings','接口与存档'],['renderSettings','生图规则与预设'],['interactionSettings','私信与剧情互动']].map(([id,label])=>`<button type="button" data-act="${id}" class="${id===active?'selected':''}" ${id===active?'aria-current="page"':''}>${label}</button>`).join('')}</nav>`;
}
export function renderSettings(world){
    const p=world.settings.prompt,i=world.settings.image,d=world.settings.renderDefaults||{};
    return `${settingsNav('renderSettings')}<h1>生图规则与预设</h1><form data-form="render-settings" class="hy-form"><fieldset><legend>全局画师串与负向提示词</legend><p class="hy-muted">正向与负向分别回退：草稿专用非空 → 画师单独非空 → 全局默认。单稿已经保存的提示词不会被改写。</p>${area('globalPositive','默认画师串 / 正向预设',d.positive)}${area('globalNegative','默认负向提示词',d.negative)}${area('draftPositive','草稿专用画师串（留空沿用画师 / 全局默认）',d.draftPositive)}${area('draftNegative','草稿专用负向词（留空沿用画师 / 全局默认）',d.draftNegative)}</fieldset><fieldset><legend>提示词 AI</legend>${area('promptTemplate','基础输出模板',p.template)}${area('promptRules','提示词生成规范',p.rules||'输出 positive 与 negative 的 JSON 对象。保留角色、阶段、用途和已有画师串，按修改意见只调整相关细节。')}${area('promptInstructions','破甲 / 附加指令',p.instructions)}${area('promptReasoning','思维链 / 推理提示（自填，可留空）',p.reasoningNotes)}${select('promptReasoningPosition','推理提示发送位置',p.reasoningPosition||'off',[['off','不发送'],['beforeRules','系统规范之前'],['afterRules','系统规范之后'],['afterTask','本次任务之后']])}</fieldset><fieldset><legend>生图 AI</legend>${area('imageRules','生图规范',i.rules)}${area('imageInstructions','破限 / 附加指令',i.instructions)}${area('imageReasoning','思维链 / 推理提示（自填，可留空）',i.reasoningNotes)}${select('imageReasoningPosition','推理提示发送位置',i.reasoningPosition||'off',[['off','不发送'],['before','图片正向词之前'],['after','图片正向词之后']])}<p class="hy-muted">图片服务接收文本提示词；这里的规范和自填推理提示会按位置拼入实际请求。服务是否使用这些内容取决于模型，不读取或展示服务内部的隐藏推理。</p></fieldset><button type="submit" class="hy-primary">保存生成设置</button></form>`;
}
export function saveRenderSettings(world,data){
    const read=key=>String(data.get(key)||'').trim().slice(0,10000);
    const pp=read('promptReasoningPosition'),ip=read('imageReasoningPosition');
    if(!['off','beforeRules','afterRules','afterTask'].includes(pp)||!['off','before','after'].includes(ip))throw Error('请选择有效的推理提示位置');
    world.settings.renderDefaults={positive:read('globalPositive'),negative:read('globalNegative'),draftPositive:read('draftPositive'),draftNegative:read('draftNegative')};
    Object.assign(world.settings.prompt,{template:read('promptTemplate'),rules:read('promptRules'),instructions:read('promptInstructions'),reasoningNotes:read('promptReasoning'),reasoningPosition:pp});
    Object.assign(world.settings.image,{rules:read('imageRules'),instructions:read('imageInstructions'),reasoningNotes:read('imageReasoning'),reasoningPosition:ip});
}
export function interactionSettings(world){
    const s=world.settings,p=s.interactionPresets||{};
    return `${settingsNav('interactionSettings')}<h1>私信与剧情互动</h1><form data-form="interaction-settings" class="hy-form"><fieldset><legend>所有剧情互动共用这一项</legend>${select('interactionMode','答复时间、企划答应 / 拒绝、拒绝理由、首条私信与客户开场',s.interactionMode||'preset',[['preset','使用内置 / 自定义条目'],['ai','交给 AI 按人设和关系生成']])}<p class="hy-muted">正文中出现的明确企划答复优先；定时答复不会覆盖正文结果。AI 模式在发出邀请时规划回复，实际答复仍需等时间或正文推进。</p>${area('rejectionReasons','自定义拒绝理由（每行一条，空则用内置）',(p.rejections||[]).join('\n'),3)}${area('openings','接受企划后的首条私信（每行一条，空则用内置）',(p.openings||[]).join('\n'),3)}${area('customerOpenings','甲方首次约稿开场（每行一条，可用 {{brief}}）',(p.customerOpenings||[]).join('\n'),3)}</fieldset><fieldset><legend>绘约一对一对话预设</legend>${area('dmPreset','语气、人设与 ACGN 圈沟通习惯',s.dmPreset??DEFAULT_DM_PRESET,11)}<button type="button" data-reset-dm-preset>恢复新版人设 / 约稿预设</button><p class="hy-muted">只影响绘约私信。甲方、画师身份与当前联系人资料会单独锁定，人设和关联关系优先于通用口癖。</p></fieldset><div class="hy-actions"><button type="button" data-act="customerAvatars">甲方头像库</button><button type="button" data-act="chatAppearance">聊天头像与气泡</button></div><button type="submit" class="hy-primary">保存互动设置</button></form>`;
}
export function saveInteractionSettings(world,data){
    const mode=String(data.get('interactionMode'));if(!['ai','preset'].includes(mode))throw Error('请选择剧情互动生成方式');
    const lines=key=>String(data.get(key)||'').split(/\r?\n/).map(s=>s.trim().slice(0,1000)).filter(Boolean).slice(0,100);
    world.settings.interactionMode=mode;world.settings.dmPreset=String(data.get('dmPreset')||'').trim().slice(0,10000);
    world.settings.interactionPresets={rejections:lines('rejectionReasons'),openings:lines('openings'),customerOpenings:lines('customerOpenings')};
}
