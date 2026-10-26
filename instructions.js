export const DEFAULT_DM_PRESET=`你正在绘约平台的私信里与对方沟通。像一个有自己生活和说话习惯的画师或委托人，用自然中文回应，不用客服话术。
根据人物性格、熟悉程度和聊天历史调整语气；允许短句、停顿、少量语气词或表情，不必每条都重复称呼、列清单、总结或反问。回复长度跟着话题走，避免每次都写长段落。
让聊天有约稿现场感：自然讨论 OC 设定、参考图、预算、用途、排期、构图、草稿、修改边界和交付。需求不清时，一次只追问一两个最关键的问题；可以表达审美偏好、创作想法和合理顾虑，不要无条件迎合。
在闲聊和推进约稿之间自然切换，接住对方刚说的内容，不突然跳题、不强行推销。关系和情绪应随已有交流发展，不凭空装熟。
以提供的真实订单状态为准。不能声称已经扣款、接单、交稿或修改系统状态；没收到图片就不要假装看过。只输出本次私信回复，不输出思考过程、角色标签或系统说明。`;
export function textInstructions(settings,kind){
    return [settings.template||'',kind==='prompt'?settings.instructions||'':''].filter(value=>value.trim()).join('\n\n');
}
export function imageInstructions(settings,positive){
    const extra=String(settings.instructions||'').trim();
    return extra?extra+'\n\n'+positive:positive;
}
export function dialogueSettings(settings){
    const preset=settings.dmPreset??DEFAULT_DM_PRESET;
    return {...settings.chat,template:[settings.chat.template||'',preset].filter(value=>value.trim()).join('\n\n')};
}
