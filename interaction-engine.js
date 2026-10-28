import * as A from './api.js?v=1.5.0';
import {priceQuote} from './pricing.js?v=1.5.0';
import {PRESET_REASONS,storyCandidates,explicitStoryDecision,answer} from './projects.js?v=1.5.0';
import {relationshipContext,fullRelationshipContext,presetBenefits,personaKey} from './persona-context.js?v=1.5.0';
const sample=(items,random)=>items[Math.min(items.length-1,Math.floor(random()*items.length))];
export function mode(world){return world.settings.interactionMode==='ai'?'ai':'preset';}
export async function assessQuote(world,artist,options,signal){
    const benefit=artist.negotiatedTerms?.[personaKey()]||presetBenefits(artist),base=priceQuote(artist,{...options,discount:benefit.discount});
    if(mode(world)==='preset')return {accepted:Number(options.price)>=base.required,discount:benefit.discount,gift:benefit.gift,reason:Number(options.price)<base.required?`按「${base.summary}」需要 ${base.required} 绘币，这个报价暂时接不了。`:benefit.reason};
    const raw=await A.complete({...world.settings.chat,template:'判断一位约稿画师是否接受这份需求，严格遵守其人设、关系和用途定价。只输出 JSON。'},'chat',[{role:'user',content:JSON.stringify({task:'输出 {accepted:boolean,discount:0.05到1,gift:boolean,reason:中文理由}。只有人设/关系或明确谈价支持时才自愿降价或赠图；预算不足时可以拒绝。不要把甲方当画师。',artist:{name:artist.name,bio:artist.bio,personality:artist.personality,refusal:artist.refusal,pricing:artist.pricingRulesText},request:options,referencePrice:base.required,relationship:await fullRelationshipContext(artist),existingOffer:benefit})}],signal);
    const result=A.parseJSON(raw),discount=Number(result.discount??benefit.discount);
    if(typeof result.accepted!=='boolean'||!Number.isFinite(discount)||discount<.05||discount>1)throw Error('AI 未返回有效的接稿判断');
    const check=priceQuote(artist,{...options,discount});return {accepted:result.accepted&&Number(options.price)>=check.required,discount,gift:result.gift===true,reason:String(result.reason||'这次需求暂时无法接下。').slice(0,1000)};
}
export async function invitationPlan(world,project,artist,signal,random=Math.random){
    const options={basePrice:artist.min,price:project.budget,commercial:!!project.commercial,usages:project.usages||[],ip:project.ip||'',brief:project.brief};
    if(mode(world)==='ai'){
        const raw=await A.complete({...world.settings.chat,template:'根据画师性格、排期、关系与定价规则，规划稍后发出的企划应征答复。只输出 JSON，不立即答应。'},'chat',[{role:'user',content:JSON.stringify({task:'输出 {responseDays:1到14整数,responseMinutes:1到10080整数,decision:accepted或rejected,discount:0.05到1,gift:boolean,reason:具体拒绝或接受理由,opening:答应后第一条私信}。回复时间由性格决定。第一条私信可以自然寒暄、接梗或表达想法，不必强行沟通需求。报价不足时通常拒绝，只有关系与人设支持才自愿折扣。',day:world.day,project,artist:{name:artist.name,personality:artist.personality,bio:artist.bio,open:artist.open,available:artist.available,pricing:artist.pricingRulesText,refusal:artist.refusal},relationship:await fullRelationshipContext(artist),pricing:priceQuote(artist,options)})}],signal);
        const data=A.parseJSON(raw),discount=Number(data.discount??1);
        if(!Number.isFinite(discount)||discount<.05||discount>1)throw Error('AI 返回的折扣无效');
        const affordable=project.budget>=priceQuote(artist,{...options,discount}).required;
        if(!artist.open||artist.available>project.deadline||!affordable){data.decision='rejected';data.reason=!affordable?'预算不足以覆盖本次用途与授权的规则价，暂时无法应征。':!artist.open||artist.available>project.deadline?'排期与本次企划不匹配，暂时无法参与。':String(data.reason||'本次企划暂时不合适。');}
        return {...data,discount,source:'ai'};
    }
    const benefit=artist.negotiatedTerms?.[personaKey()]||presetBenefits(artist),pricing=priceQuote(artist,{...options,discount:benefit.discount}),busy=!artist.open||artist.available>project.deadline;
    const rejected=busy||project.budget<pricing.required||random()<.15,kind=busy?'busy':project.budget<pricing.required?'price':'taste';
    return {responseDays:/慢热|谨慎|严谨|沉默/.test(artist.personality)?3:1,responseMinutes:/活泼|话多|热情/.test(artist.personality)?3:15,decision:rejected?'rejected':'accepted',reason:rejected?sample(world.settings.interactionPresets?.rejections?.length?world.settings.interactionPresets.rejections:PRESET_REASONS[kind],random):'题材和排期都合适，愿意来聊聊。',opening:world.settings.interactionPresets?.openings?.length?sample(world.settings.interactionPresets.openings,random):/活泼|话多/.test(artist.personality)?'老师我看完企划啦，这个设定有点戳我……想先蹲下听听你脑内的画面！':'企划我看过了，想接。你最想保留的是哪个画面或设定？',discount:benefit.discount,gift:benefit.gift,source:'preset'};
}
export async function followStory(world,messageId,signal){
    const c=A.context(),m=c?.chat?.[messageId],ch=c?.characters?.[c.characterId];if(!m||m.is_user||m.is_system||!ch)return false;
    const body=String(m.mes||'');if(!/(企划|应征|邀请|项目)/.test(body))return false;
    const candidates=storyCandidates(world,ch.avatar,body);if(!candidates.length)return false;
    const sourceKey=JSON.stringify([c.getCurrentChatId?.()||'',messageId,body]);if((world.projectStorySeen||[]).includes(sourceKey))return false;
    let decision=explicitStoryDecision(body),reason=body.slice(0,2000),target=candidates.length===1?candidates[0]:null;
    if(mode(world)==='ai'){
        const raw=await A.complete({...world.settings.chat,template:'只提取新增正文中画师对企划已明确作出的答复，不推测未来计划。只输出 JSON。'},'chat',[{role:'user',content:JSON.stringify({task:'输出 {invitationId:真实邀请id或null,decision:accepted或rejected或null,reason:正文依据,opening:可直接发给甲方的原意回复}。没有明确答复则返回 null。',candidates:candidates.map(x=>({invitationId:x.item.id,artist:x.artist.name,project:x.project.title})),body})}],signal);
        const data=A.parseJSON(raw);if(!data)return false;target=candidates.find(x=>x.item.id===data.invitationId);decision=data.decision;reason=String(data.reason||body).slice(0,2000);if(target&&['accepted','rejected'].includes(decision))target.opening=String(data.opening||body).slice(0,2000);
    }
    if(!target||!['accepted','rejected'].includes(decision))return false;
    answer(world,target.project,target.item,decision,{reason,opening:target.opening||body.slice(0,2000)},'story');target.item.storySource={chatId:c.getCurrentChatId?.()||'',messageId,body:body.slice(0,4000)};
    (world.projectStorySeen||=[]).push(sourceKey);world.projectStorySeen=world.projectStorySeen.slice(-200);return true;
}

export async function customerOpening(world,person,order,signal){
    if(mode(world)==='preset'){const choices=world.settings.interactionPresets?.customerOpenings;return choices?.length?sample(choices,Math.random).replaceAll('{{brief}}',order.brief):order.clientName==='小满'?'老师，想问问这个 OC 设定能不能接……服装可能有点复杂 orz。'+order.brief:order.clientName==='青禾'?'老师好！我又来给我家崽找饭了，这次想约这样的画面：'+order.brief:'你好，想询问这份需求的档期和报价。'+order.brief;}
    return A.complete({...world.settings.chat,template:'你是想找画师约稿的甲方，不是画师。按人物性格写一条自然的首次私信，只返回正文。'},'chat',[{role:'user',content:JSON.stringify({person,brief:order.brief,budget:order.price,artist:world.accounts.artist,task:'作为甲方向对面的画师询问能否接稿。根据自己人设决定语气，可以有合适的 OC/ACGN 语气或梗，不能声称自己接稿或给画师报价。'})}],signal);
}
