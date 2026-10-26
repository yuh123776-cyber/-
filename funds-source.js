// Local-only reading. This module never sends persona or lorebook data to a model.
import {persona,explicitBalance} from './finance.js?v=1.1.0';
export async function readExplicitFunds(context,extraBook='') {
    if(!context)throw Error('请在酒馆打开 user 人设和聊天后读取剧情资产');
    const identity=persona(context),direct=explicitBalance(identity.description);
    if(direct)return {identity,result:direct};
    const books=[identity.book,context.chatMetadata?.world_info,context.characters?.[context.characterId]?.data?.extensions?.world,extraBook].filter(Boolean);
    for(const name of new Set(books)){
        if(!context.loadWorldInfo)throw Error('当前酒馆未提供读取世界书的接口');
        const book=await context.loadWorldInfo(name);
        for(const entry of Object.values(book?.entries||{})){
            if(entry.disable)continue;
            const source=String(entry.content||''),heading=String(entry.comment||'')+' '+JSON.stringify(entry.key||[]);
            const belongs=/\{\{user\}\}|\buser\b/i.test(heading)||(identity.name.length>1&&heading.includes(identity.name));
            if(!belongs)continue;
            const result=explicitBalance(source);
            if(result)return {identity,result:{...result,basis:`世界书「${name}」/「${entry.comment||'user 条目'}」：${result.basis}`}};
        }
    }
    return {identity,result:null};
}
