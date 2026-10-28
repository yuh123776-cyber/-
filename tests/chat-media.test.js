import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newWorld,message,validateWorld} from '../core.js?v=1.5.0';
import {addSticker,availableStickers,stickerInstructions,parseStickerReply,chatContent} from '../chat-media.js?v=1.5.0';
test('AI 只能使用表情库中存在的图片，未知标记不能指定任意图片',()=>{
 const w=newWorld(),a=addSticker(w,{name:'猫猫点头',description:'同意，收到',asset:'local-image'});
 assert.deepEqual(parseStickerReply(`收到啦 [[HY_STICKER:${a.id}]]`,[a]),{body:'收到啦',asset:'local-image',kind:'sticker',stickerId:a.id,stickerName:'猫猫点头'});
 assert.deepEqual(parseStickerReply('收到 [[HY_STICKER:https://not-allowed.invalid/image.png]]',[a]),{body:'收到'});assert.throws(()=>parseStickerReply('[[HY_STICKER:unknown]]',[a]));
 assert.equal(parseStickerReply(`[[HY_STICKER:${a.id}]] [[HY_STICKER:${a.id}]]`,[a]).asset,a.asset);
});
test('表情开关可停用 AI 调用，模型只收到名称描述及附件文字说明',()=>{
 const w=newWorld(),a=addSticker(w,{name:'开心',description:'开心或感谢时使用',asset:'local-private-id'});assert.equal(availableStickers(w).length,1);const instructions=stickerInstructions(availableStickers(w));assert.ok(instructions.includes('开心'));assert.ok(!instructions.includes(a.asset));
 w.settings.aiStickersEnabled=false;assert.deepEqual(availableStickers(w),[]);assert.equal(stickerInstructions([]),'');assert.equal(chatContent({body:'这是我的 OC',kind:'image',asset:'local'}),'这是我的 OC\n[发送了一张图片；仅提供文字说明，未向模型发送原图]');assert.equal(chatContent({body:'',asset:'local',kind:'sticker',stickerName:'开心'}),'[发送表情：开心]');
});
test('表情名称校验、旧存档兼容，删除表情不移除已发送图片',()=>{
 const w=newWorld();assert.equal(validateWorld(w),w);assert.throws(()=>addSticker(w,{name:'',asset:'a'}));const sticker=addSticker(w,{name:'收到',asset:'original'});message(w,w.artists[0].id,'client','',{from:'user',asset:sticker.asset,kind:'sticker',stickerName:sticker.name});w.stickers=[];assert.equal(Object.values(w.messages)[0][0].asset,'original');assert.equal(validateWorld(w),w);w.stickers=[{id:'bad',name:'bad'}];assert.throws(()=>validateWorld(w));
});
