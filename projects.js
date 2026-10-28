import {uid,text,message,notify} from './core.js?v=1.5.0';
export const PRESET_REASONS={price:['这份用途算上授权会超出目前预算，怕接了以后双方都不好调整。','想先把授权范围和稿费对齐，这个预算暂时接不了。'],busy:['最近排期已经有点满了，这次先不占你的名额，抱歉啦。','这个截稿时间可能赶不上，怕耽误企划，先婉拒了。'],taste:['题材挺有意思的，不过和我最近想画的方向有点不一样，这次先不接啦。','这类构图不是我最擅长的，怕画不出你要的感觉，还是把机会留给更合适的老师。']};
export function invitation(project,artistId){return project.invitations?.find(item=>item.artistId===artistId)||null;}
export function enqueue(world,project,artist,plan,now=Date.now()){
    if(project.deadline<=world.day)throw Error('企划已经截稿');
    if(invitation(project,artist.id))throw Error('已经向这位画师发出过邀请，请查看回复');
    const days=Number(plan.responseDays),minutes=Number(plan.responseMinutes);
    if(!Number.isInteger(days)||days<1||days>14||!Number.isInteger(minutes)||minutes<1||minutes>10080||!['accepted','rejected'].includes(plan.decision))throw Error('画师回复计划格式不正确');
    const item={id:uid(),artistId:artist.id,status:'pending',sentDay:world.day,dueDay:world.day+days,sentAt:now,dueAt:now+minutes*60000,plan:{decision:plan.decision,reason:text(plan.reason,1000),opening:text(plan.opening,2000),discount:Number(plan.discount)||1,gift:plan.gift===true},source:plan.source||'preset'};
    (project.invitations||=[]).push(item);return item;
}
export function answer(world,project,item,decision,details={},source='preset'){
    if(!['accepted','rejected'].includes(decision))throw Error('回复状态不正确');
    const previous=item.status,oldOpening=item.opening;
    item.status=decision;item.reason=text(details.reason,2000);item.opening=text(details.opening,3000);item.answeredDay=world.day;item.source=source;
    item.discount=Number(details.discount)||item.plan?.discount||1;item.gift=details.gift??item.plan?.gift??false;
    project.applicants||=[];
    if(decision==='accepted'){
        if(!project.applicants.includes(item.artistId))project.applicants.push(item.artistId);
        if(previous!=='accepted'||(source==='story'&&item.opening!==oldOpening))message(world,item.artistId,project.ownerRole||'client',item.opening||'看到企划邀请了，想先和你聊聊具体想法。',{from:'artist',projectId:project.id,invitationId:item.id});
    }else{project.applicants=project.applicants.filter(id=>id!==item.artistId);if(previous!==decision||source==='story')message(world,item.artistId,project.ownerRole||'client',item.reason||'这次暂时无法参与，抱歉。',{from:'artist',projectId:project.id,invitationId:item.id});}
    const name=world.artists.find(a=>a.id===item.artistId)?.name||'画师';notify(world,`${name}${decision==='accepted'?'已回应企划，先来私信聊聊':'婉拒了企划邀请'}「${project.title}」`,project.ownerRole||'client');
}
export function resolveDue(world,now=Date.now()){
    let count=0;
    for(const project of world.projects)for(const item of project.invitations||[]){
        if(item.status!=='pending'||item.source==='story')continue;
        if(project.deadline<world.day){item.status='expired';item.reason='企划截稿前没有完成回复。';count++;continue;}
        if(world.day>=item.dueDay||now>=item.dueAt){answer(world,project,item,item.plan.decision,item.plan,item.source);count++;}
    }
    return count;
}
export function storyCandidates(world,avatar,body){
    const artists=world.artists.filter(a=>a.linked?.avatar===avatar),items=[];
    for(const artist of artists)for(const project of world.projects){const item=invitation(project,artist.id);if(item)items.push({artist,project,item});}
    const named=items.filter(({project})=>body.includes(project.title));return named.length?named:items.length===1?items:[];
}
export function explicitStoryDecision(body){
    if(/(?:不接|拒绝|婉拒|不能参加|无法参与|不参加|不应征|不能接).{0,30}(?:企划|邀请|应征|项目)|(?:企划|邀请|应征|项目).{0,30}(?:不接|拒绝|婉拒|无法参与|不能接)/s.test(body))return 'rejected';
    for(const sentence of body.split(/[。！？!?；;\n]/)){
        if(/(?:如果|考虑|可能|是否|要不要|还没|尚未|打算|想要|准备).{0,25}(?:企划|邀请|应征|项目)/.test(sentence))continue;
        if(/(?:答应|接受|同意|接下|愿意参与).{0,30}(?:企划|邀请|应征|项目)|(?:企划|邀请|应征|项目).{0,30}(?:答应|接受|同意|接下|愿意参与)/.test(sentence))return 'accepted';
    }
    return null;
}
