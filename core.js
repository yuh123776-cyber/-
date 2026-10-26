// IDs are local record identifiers, not authentication tokens. getRandomValues is
// available on ordinary HTTP origins where randomUUID may be unavailable.
export function uid() {
    const crypto = globalThis.crypto;
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto?.getRandomValues !== 'function') throw Error('浏览器不支持随机数接口，请使用较新的 Chrome 或 Edge 浏览器');
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export const STAGES = ['草稿','线稿','上色','成稿'];
export function integer(value, min = 0, max = 1e8) {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw Error(`请输入 ${min}～${max} 之间的整数`);
    return n;
}
export function text(value, max = 10000) { return String(value ?? '').trim().slice(0, max); }
export function artist(input = {}) {
    return { id: uid(), name: text(input.name || '新画师', 50), bio: text(input.bio || '欢迎来找我讨论你的 OC。', 4000),
        style: text(input.style || '日系插画', 500), promptPreset:text(input.promptPreset,4000),negativePreset:text(input.negativePreset,4000), personality: text(input.personality || '温和认真', 2000),
        avatar: input.avatar || null, fans: integer(input.fans ?? 0), min: integer(input.min ?? 280, 1),
        max: integer(input.max ?? 1200, 1), days: integer(input.days ?? 12, 1, 365), revisions: integer(input.revisions ?? 2, 0, 30),
        open: input.open !== false, available: integer(input.available ?? 1, 1), works: [], reviews: [], favorite: false,
        refusal: text(input.refusal || '不接受信息不完整的需求', 1000), linked: null, ...input };
}
export function artistPresets(a){return {positive:text(a?.promptPreset,4000),negative:text(a?.negativePreset,4000)};}
export function withArtistPresets(positive,negative,presets){
    const combine=(body,preset)=>{body=text(body);preset=text(preset,4000);return !preset||body.includes(preset)?body:preset+(body?', '+body:'');};
    return {positive:combine(positive,presets?.positive),negative:combine(negative,presets?.negative)};
}
export function newWorld(id = uid()) {
    const a = [artist({name:'雾见青',style:'唯美厚涂 · 角色立绘',personality:'温和细腻，重视细节。需求模糊时会耐心追问。',fans:12000,min:280,max:900,days:12}),
        artist({name:'山茶汽水',style:'日系清新 · 双人插画',personality:'活泼话多，喜欢聊 OC 的故事，经常主动给构图建议。',fans:8420,min:450,max:1200,days:9}),
        artist({name:'眠岛',style:'暗黑幻想 · 服装设计',personality:'冷淡专业，表达简洁，有自己的审美主张。',fans:23100,min:680,max:2200,days:18})];
    return {schema:1,id,day:1,role:'client',artistActivated:false, accounts:{client:{id:uid(),name:'委托人',bio:'把脑海里的故事画下来。',avatar:null,balance:10000},artist:{id:uid(),name:'我的画室',bio:'今天也想画点喜欢的东西。',avatar:null,balance:0,min:280,max:1200,days:12,revisions:2}},
        artists:a, commissions:[], auctions:[], posts:[], projects:[], messages:{}, ledger:[], events:[], bridge:[],
        settings:{theme:'sky',accent:'#76aaca',radius:22,fontSize:15,background:null,customCSS:'',randomEvents:true,autoPrompt:false,autoImage:false,bridgeEnabled:false,inject:false,sharedProfile:false,
            chat:{mode:'tavern',url:'',model:'',template:'你是虚拟约稿平台上的画师。保持角色一致，用中文自然交流。报价只是建议，以系统订单为准。'},
            prompt:{mode:'tavern',url:'',model:'',instructions:'',template:'把约稿需求整理为绘图提示词。仅输出 JSON：{"positive":"英文正向提示词","negative":"英文负向提示词"}。保留角色外貌、服装、构图与上版要求。'},
            image:{mode:'tavern',url:'',model:'',instructions:'',width:768,height:1024,steps:28,cfg:7}},notifications:[]};
}
export function notify(w, message, role = 'all') { w.notifications.unshift({id:uid(),day:w.day,message:text(message),role}); w.notifications=w.notifications.slice(0,200); }
export function record(w, message) { const e={id:uid(),day:w.day,message:text(message)}; w.events.push(e); return e; }
export function money(w, role, delta, reason, ref = '') {
    integer(Math.abs(delta), 0); if (!['client','artist'].includes(role)) throw Error('未知账户');
    const account=w.accounts[role]; if(account.balance+delta<0) throw Error('绘币余额不足');
    account.balance+=delta; w.ledger.push({id:uid(),role,delta,reason,ref,day:w.day,balance:account.balance});
}
export function activateArtist(w) {
    if(w.artistActivated)throw Error('画师身份已经开通');
    w.artistActivated=true;w.role='artist';
    record(w,'开通画师身份，开始接收虚拟约稿请求');
    return incoming(w);
}
export function deactivateArtist(w) {
    if(!w.artistActivated)throw Error('画师身份尚未开通');
    w.artistActivated=false;w.role='client';
    for(const o of w.commissions)if(o.owner==='artist'&&o.status==='quoted')o.status='cancelled';
    record(w,'注销画师身份，停止接收新请求；资料、余额与已接订单保留');
}
export function socialReactions(w,p,random=Math.random) {
    // These are local, fictional contacts, never real users or arbitrary AI names.
    const peers=w.artists.filter(a=>a.id!==p.artistId&&a.name!==p.author).map(a=>({id:a.id,name:a.name,relation:'创作同好'}));
    const contacts=['小满','青禾','远山'].filter(name=>name!==p.author).map((name,i)=>({id:`contact:${p.artistId||p.role||'world'}:${i}`,name,relation:'可能认识的同好'}));
    const pool=[...peers,...contacts];
    p.likePeople=[];p.comments||=[];p.likes=0;p.liked=false;
    const shuffled=pool.map(person=>({person,key:random()})).sort((a,b)=>a.key-b.key).map(x=>x.person);
    const count=Math.min(shuffled.length,1+Math.floor(random()*3));
    p.likePeople=shuffled.slice(0,count).map(person=>({...person}));p.likes=p.likePeople.length;
    const replies=/配色|色彩|颜色/.test(p.body)?['这个配色好温柔，想看后续！','这组颜色很适合你的画风。']:/草稿|成稿|稿件|交稿/.test(p.body)?['这次的稿件好期待，辛苦啦！','来蹲一张完成后的展示。']:['带着灵感来串门啦，期待你的新作品！','忙创作也要记得休息呀。'];
    for(const person of shuffled.slice(0,Math.min(2,1+Math.floor(random()*2))))p.comments.push({id:uid(),author:person.name,personId:person.id,relation:person.relation,body:replies[p.comments.length%replies.length],day:w.day});
    return p;
}
export function likePeople(p) { return Array.isArray(p.likePeople)?p.likePeople:[]; }
export function hasLiked(w,p) { return likePeople(p).some(person=>person.id===w.accounts[w.role].id)||(p.liked===true&&!Array.isArray(p.likePeople)); }
export function toggleLike(w,p) {
    if(!p)throw Error('动态不存在');
    const account=w.accounts[w.role];
    if(!Array.isArray(p.likePeople)){
        p.likePeople=[];
        if(p.liked)p.likePeople.push({id:account.id,name:account.name,relation:'我'});
    }
    const i=p.likePeople.findIndex(person=>person.id===account.id);
    if(i>=0){p.likePeople.splice(i,1);p.likes=Math.max(0,p.likes-1);}
    else{p.likePeople.push({id:account.id,name:account.name,relation:w.role==='artist'?'画师':'委托人'});p.likes++;}
    p.liked=p.likePeople.some(person=>person.id===account.id);
}
export function message(w, artistId, role, body, extra = {}) {
    const key=`${role}:${artistId}`; const msg={id:uid(),day:w.day,body:text(body),...extra};
    (w.messages[key] ||= []).push(msg); return msg;
}
export function quote(w, artistId, options) {
    const a=w.artists.find(a=>a.id===artistId); if(!a) throw Error('找不到画师');
    if(!a.open || a.available>w.day) throw Error('画师当前暂不接稿或尚未到档期');
    const price=integer(options.price, a.min, a.max), days=integer(options.days??a.days,1,365);
    if(text(options.brief).length<5) throw Error('请至少用五个字描述约稿需求');
    const o={id:uid(),artistId,owner:'client',title:text(options.title||'我的委托',100),brief:text(options.brief),price,days,stage:0,status:'quoted',createdDay:w.day,revisions:0,maxRevisions:a.revisions,versions:[],commercial:!!options.commercial,dueDay:null,paused:false};
    w.commissions.push(o); record(w,`与 ${a.name} 商议「${o.title}」，待确认 ${price} 绘币`); return o;
}
export function pay(w,id) {
    const o=order(w,id);if(o.status!=='quoted') throw Error('订单已经处理，不能重复付款');
    money(w,o.owner,-o.price,'委托托管',o.id);o.status='working';o.startDay=w.day;o.dueDay=w.day+o.days;o.nextDay=w.day+Math.max(1,Math.ceil(o.days/4));
    record(w,`「${o.title}」已确认，${o.price} 绘币进入托管`);return o;
}
export function order(w,id) { const o=w.commissions.find(x=>x.id===id);if(!o)throw Error('找不到订单');return o; }
export function placeholder(w,id,note='') {
    const o=order(w,id);if(!['working','review'].includes(o.status)) throw Error('订单当前不能提交稿件');
    const v={id:uid(),number:o.versions.length+1,stage:STAGES[o.stage],note:text(note),positive:'',negative:'',asset:null,source:'placeholder',status:'empty',day:w.day,seed:Math.floor(Math.random()*2147483647),params:null,error:null};
    o.versions.push(v);o.status='review';o.paused=true;
    message(w,o.artistId,o.owner,`${v.stage} V${v.number} 的位置先放在这里，完成后就可以直接查看。`,{from:'artist',versionId:v.id,orderId:o.id});
    record(w,`「${o.title}」提交 ${v.stage} V${v.number} 占位`);notify(w,`「${o.title}」${v.stage}等待验收`,o.owner);return v;
}
export function findVersion(w,id) {for(const o of w.commissions){const v=o.versions.find(v=>v.id===id);if(v)return {o,v};}throw Error('找不到稿件版本');}
export function approve(w,id) {
    const o=order(w,id);if(o.status!=='review')throw Error('当前没有待验收稿件');
    const v=o.versions.at(-1); if(!v?.asset && !v?.note)throw Error('请先上传图片或填写文字稿件说明后验收');
    v.accepted=true;o.paused=false;
    if(o.stage===3){o.status='complete';if(o.owner==='artist')money(w,'artist',o.price,'委托结算',o.id);record(w,`「${o.title}」已完成验收`);}
    else{o.stage++;o.status='working';o.nextDay=w.day+Math.max(1,Math.ceil(o.days/4));record(w,`「${o.title}」通过验收，进入${STAGES[o.stage]}`);}
}
export function revise(w,id,note) {
    const o=order(w,id);if(o.status!=='review')throw Error('当前没有待修改稿件');
    if(o.revisions>=o.maxRevisions)throw Error('已达约定修改次数，可沟通后取消订单或验收');
    if(!text(note))throw Error('请填写修改意见');
    o.revisions++;o.status='working';o.paused=false;o.nextDay=w.day+1;o.lastRevision=text(note);
    message(w,o.artistId,o.owner,note,{from:'user'}); record(w,`「${o.title}」请求修改：${text(note,200)}`);
}
export function cancelOrder(w,id) {
    const o=order(w,id);if(['complete','cancelled'].includes(o.status))throw Error('订单已结束');
    if(o.status!=='quoted' && o.owner==='client')money(w,'client',o.price,'协商取消退款',o.id);
    o.status='cancelled';record(w,`「${o.title}」已取消（模拟协商全额退款）`);
}
export function auction(w,input) {
    const type=['成稿','OC 人设','画师档期'].includes(input.type)?input.type:'成稿';
    if(!text(input.title))throw Error('请输入拍品标题');
    if(type!=='画师档期'&&!input.asset)throw Error('成稿或 OC 拍品需要上传图片');
    const a={id:uid(),title:text(input.title,100),description:text(input.description),type,asset:input.asset||null,artistId:input.artistId||null,seller:input.seller||'npc',start:integer(input.start??100,1),increment:integer(input.increment??20,1),endDay:w.day+integer(input.duration??3,1,365),status:'open',bids:[],held:0,winner:null};w.auctions.push(a);return a;
}
export function bid(w,id,amount,bidder='client') {
    const a=w.auctions.find(x=>x.id===id);if(!a||a.status!=='open'||a.endDay<=w.day)throw Error('拍卖已结束');
    if(a.seller===bidder)throw Error('不能竞拍自己的拍品');
    const last=a.bids.at(-1), minimum=last?last.amount+a.increment:a.start;amount=integer(amount,minimum);
    // Reserve virtual funds; release the preceding reservation before replacing it.
    const credit=last?.bidder===bidder?a.held:0;
    if(['client','artist'].includes(bidder)&&w.accounts[bidder].balance+credit<amount)throw Error('绘币余额不足');
    if(a.held && ['client','artist'].includes(last?.bidder))money(w,last.bidder,a.held,'稿拍预留退回',a.id);
    a.held=0;
    if(['client','artist'].includes(bidder)){money(w,bidder,-amount,'稿拍出价预留',a.id);a.held=amount;}
    a.bids.push({id:uid(),bidder,amount,day:w.day});return a;
}
export function advance(w,days,random=Math.random) {
    days=integer(days,1,30);const created=[];
    for(let i=0;i<days;i++){
        w.day++;
        for(const o of w.commissions){
            if(o.status==='working'&&w.day>=o.nextDay){
                if(w.settings.randomEvents&&!o.delayed&&random()<0.12){o.delayed=true;o.nextDay+=2;o.dueDay+=2;notify(w,`「${o.title}」画师因私事延期 2 个剧情日`,o.owner);record(w,`「${o.title}」延期 2 日`);}
                else if(o.owner==='client')created.push(placeholder(w,o.id,o.lastRevision||`${STAGES[o.stage]}说明：按照约定保留角色特征、配色和构图，等待图片或补充文字。`));
                else notify(w,`「${o.title}」到达交稿节点，请在工作台提交稿件`,'artist');
            }
        }
        for(const a of w.auctions.filter(a=>a.status==='open')){
            if(a.endDay<=w.day){a.status='closed';a.winner=a.bids.at(-1)?.bidder||null;const amount=a.bids.at(-1)?.amount||0;
                if(a.winner&&['client','artist'].includes(a.seller))money(w,a.seller,amount,'稿拍成交收入',a.id);
                a.held=0;record(w,`稿拍「${a.title}」${a.winner?`以 ${amount} 绘币成交`:'流拍'}`);notify(w,`稿拍「${a.title}」已结束`);
            }else if(w.settings.randomEvents&&random()<0.35)bid(w,a.id,(a.bids.at(-1)?.amount||a.start-a.increment)+a.increment,'npc');
        }
        if(w.settings.randomEvents&&random()<0.25){const a=w.artists[Math.floor(random()*w.artists.length)];if(a)w.posts.unshift(socialReactions(w,{id:uid(),author:a.name,artistId:a.id,category:'生活',body:['今天在整理参考图，新的灵感慢慢来了。','在画一个很喜欢的角色，期待交稿的那天。','今天的色彩练习完成了。'][Math.floor(random()*3)],asset:null,day:w.day,likes:0,liked:false,comments:[]},random));}
    }
    record(w,`剧情推进 ${days} 日`);return created;
}
export function incoming(w) {
    if(!w.artistActivated)throw Error('请先启用画师身份');
    const p=w.accounts.artist;
    const o={id:uid(),artistId:'self',owner:'artist',clientName:['小满','青禾','远山'][w.commissions.length%3],title:'新的 OC 插画委托',brief:'想约一张日系 OC 半身插画，浅色服装、花园背景。细节和构图可以一起商量。',price:integer(p.min,1),days:integer(p.days,1,365),stage:0,status:'quoted',createdDay:w.day,revisions:0,maxRevisions:integer(p.revisions??2,0,30),versions:[],commercial:false,dueDay:null,paused:false};
    w.commissions.push(o);message(w,'self','artist',`${o.clientName}：老师好！${o.brief} 预算 ${o.price} 绘币，可以接吗？`,{from:'client',orderId:o.id});notify(w,'收到一份新的虚拟客户委托','artist');return o;
}
export function acceptIncoming(w,id){if(!w.artistActivated)throw Error('请先重新开通画师身份');const o=order(w,id);if(o.owner!=='artist'||o.status!=='quoted')throw Error('不能接受此委托');o.status='working';o.startDay=w.day;o.dueDay=w.day+o.days;o.nextDay=w.day+Math.ceil(o.days/4);record(w,`接受客户「${o.title}」，${o.price} 绘币由虚拟客户托管`);}
export function validateWorld(w) {
    if(!w||w.schema!==1||typeof w.id!=='string'||!Number.isSafeInteger(w.day)||w.day<1)throw Error('不支持的存档格式');
    for(const k of ['artists','commissions','auctions','posts','projects','ledger','events','bridge','notifications'])if(!Array.isArray(w[k]))throw Error(`存档缺少 ${k}`);
    for(const role of ['client','artist']){if(!w.accounts?.[role])throw Error('存档缺少账户');integer(w.accounts[role].balance);}
    if(!w.settings||!w.messages||!['client','artist'].includes(w.role))throw Error('存档设置损坏');
    for(const kind of ['chat','prompt','image'])if(!w.settings[kind]||typeof w.settings[kind].mode!=='string')throw Error('存档 API 设置损坏');
    for(const role of ['client','artist'])if(typeof w.accounts[role].name!=='string'||typeof w.accounts[role].bio!=='string')throw Error('账户资料损坏');
    for(const a of w.artists)if(!['name','bio','style','personality','refusal'].every(k=>typeof a[k]==='string')||!Array.isArray(a.works)||!Array.isArray(a.reviews))throw Error('画师资料损坏');
    for(const p of w.posts)if(!p||typeof p.body!=='string'||!Array.isArray(p.comments)||!Number.isSafeInteger(p.likes)||p.likes<0)throw Error('动态资料损坏');
    for(const ms of Object.values(w.messages))if(!Array.isArray(ms)||ms.some(m=>!m||typeof m.body!=='string'))throw Error('私信记录损坏');
    for(const p of w.projects)if(!p||typeof p.title!=='string'||!Array.isArray(p.applicants))throw Error('企划记录损坏');
    const ids=new Set();for(const a of w.artists){if(!a.id||ids.has(a.id))throw Error('画师 ID 重复');ids.add(a.id);integer(a.min,1);integer(a.max,a.min);integer(a.days,1,365);}
    const orderIds=new Set(),vids=new Set();for(const o of w.commissions){if(!o.id||orderIds.has(o.id))throw Error('订单 ID 重复');orderIds.add(o.id);integer(o.price,1);integer(o.stage,0,3);if(typeof o.title!=='string'||typeof o.brief!=='string')throw Error('订单文字损坏');if(!Array.isArray(o.versions)||!['quoted','working','review','complete','cancelled'].includes(o.status))throw Error('订单损坏');for(const v of o.versions){if(!v.id||vids.has(v.id))throw Error('稿件 ID 重复');vids.add(v.id);if(typeof v.positive!=='string'||typeof v.negative!=='string'||typeof v.note!=='string')throw Error('稿件资料损坏');}}
    for(const a of w.auctions){integer(a.start,1);integer(a.increment,1);if(!Array.isArray(a.bids)||!['open','closed'].includes(a.status))throw Error('拍卖损坏');}
    if(w.stickers!==undefined){if(!Array.isArray(w.stickers))throw Error('表情包资料损坏');const stickerIds=new Set();for(const sticker of w.stickers){if(!sticker||typeof sticker.id!=='string'||!sticker.id||stickerIds.has(sticker.id)||typeof sticker.name!=='string'||!sticker.name.trim()||typeof sticker.asset!=='string'||!sticker.asset)throw Error('表情包资料损坏');stickerIds.add(sticker.id);}}
    if(w.finances){if(typeof w.finances!=='object'||Array.isArray(w.finances))throw Error('剧情资产格式错误');for(const f of Object.values(w.finances)){if(!f||!['CN','US','JP','OTHER'].includes(f.region)||!Array.isArray(f.channels)||f.channels.length!==3||!Array.isArray(f.ledger)||!f.processed||!f.cursors)throw Error('剧情资产损坏');const ids=new Set();for(const c of f.channels){integer(c.cents,0,10000000000);if(!c.id||ids.has(c.id))throw Error('支付账户损坏');ids.add(c.id);}}}
    return w;
}
