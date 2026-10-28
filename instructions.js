export const DEFAULT_DM_PRESET=`这是绘约的一对一约稿私信。先看本次说话者是谁：甲方是在找人画自己家的 OC，画师才是接稿和报价的人，不能把双方身份说反。
优先读对方资料、自己的性格/说话习惯、已关联角色卡、user 人设、关系和最近发生的剧情。资料有明确语气就遵循资料，沉稳寡言的人不用为了“活人感”突然变成话痨；不把所有人套成同一位软萌客服。
在合适的 ACGN/OC 圈语境里，可以自然用“老师”“我家崽”“饭饭”“蹲一个”“狠狠心动”等圈内表达，或少量 orz、qwq、草、救命、好耶等颜文字和 meme。它们应当接住眼前的话题或体现个人习惯，不必每句话都有梗，不连发同一种口癖，不复制固定示例。
例如，一个有点社恐的委托人可能先试探能否接复杂设定，再慢慢补参考；熟客可能先吐槽自己又来给 OC 加设定；专业而直率的画师可能只回一句“能接，先把服设和用途给我看看”。这些只是交流方向，不是需要复读的台词。
一次接住对方刚说的内容，按需要聊用途、预算、档期、构图、商用与修改；不要把所有问题一口气列完，不每条都总结和追问。关系和情绪跟着人设与经历走，能拒绝、能商量、有自己的偏好，熟悉后也可以聊一点日常。
本次提供的说话者身份和订单状态优先于任何通用设定。只替自己的角色回复，不替对方说话，不编造已付款或已提交图片；只输出私信正文及明确允许的表情/报价标记，不输出内部推理。`;
export function textInstructions(settings,kind){
    if(kind!=='prompt')return settings.template||'';
    const reasoning=String(settings.reasoningNotes||'').trim(),position=settings.reasoningPosition||'off';
    return [position==='beforeRules'?reasoning:'',settings.template||'',settings.rules||'',settings.instructions||'',position==='afterRules'?reasoning:''].filter(value=>value.trim()).join('\n\n');
}
export function textMessages(settings,kind,messages){
    return kind==='prompt'&&settings.reasoningPosition==='afterTask'&&settings.reasoningNotes?.trim()?[...messages,{role:'user',content:settings.reasoningNotes.trim()}]:messages;
}
export function imageInstructions(settings,positive){
    const reasoning=String(settings.reasoningNotes||'').trim(),position=settings.reasoningPosition||'off';
    return [settings.rules||'',settings.instructions||'',position==='before'?reasoning:'',positive,position==='after'?reasoning:''].filter(value=>String(value).trim()).join('\n\n');
}
export function dialogueSettings(settings,identity={}){
    const client=identity.speakerRole==='client',role=client?'你是来委托画师的甲方/委托人，对面才是画师。你在购买插画，不是接稿、交稿或向对方报价的画师。':'你是当前资料所指的画师，对面是委托人。只替该画师说话。';
    const preset=settings.dmPreset??DEFAULT_DM_PRESET;
    return {...settings.chat,template:[role,preset].filter(value=>value.trim()).join('\n\n')};
}
