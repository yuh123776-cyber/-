import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../core.js?v=1.5.0';
test('不同客户各自收消息，交稿和修改进入正确线程',()=>{
 const w=C.newWorld();w.artistActivated=true;const a=C.incoming(w),b=C.incoming(w);assert.notEqual(a.clientId,b.clientId);assert.equal(w.messages['artist:self'],undefined);assert.equal(C.contact(w,a.clientId).name,a.clientName);
 C.acceptIncoming(w,a.id);C.acceptIncoming(w,b.id);const v=C.placeholder(w,a.id,'只给第一位客户的稿件');C.revise(w,a.id,'只给第一位的修改意见');assert.equal(w.messages['artist:'+a.clientId].length,3);assert.equal(w.messages['artist:'+b.clientId].length,1);assert.equal(w.messages['artist:'+a.clientId][1].from,'user');assert.equal(w.messages['artist:'+a.clientId][2].from,'client');assert.equal(w.messages['artist:'+a.clientId][1].versionId,v.id);
});
test('相同客户再次委托沿用自己的会话',()=>{const w=C.newWorld();w.artistActivated=true;const a=C.incoming(w);C.incoming(w);C.incoming(w);const again=C.incoming(w);assert.equal(a.clientName,again.clientName);assert.equal(a.clientId,again.clientId);assert.equal(w.customers.length,3);});
test('旧混合记录只按明确来源分配，未知消息保留，重复迁移不复制',()=>{
 const w=C.newWorld();w.artistActivated=true;const a=C.incoming(w),b=C.incoming(w);delete a.clientId;delete b.clientId;w.customers=[];w.messages={};
 C.message(w,'self','artist',a.clientName+'：最初委托',{from:'client',orderId:a.id});C.message(w,'self','artist',b.clientName+'：另一个委托',{from:'client',orderId:b.id});C.message(w,'self','artist','无法归属的旧回复',{from:'user',asset:'kept-image'});
 C.migrateCustomerThreads(w);assert.equal(w.messages['artist:'+a.clientId].length,1);assert.equal(w.messages['artist:'+b.clientId].length,1);assert.equal(w.messages['artist:self'][0].asset,'kept-image');const before=structuredClone(w);C.migrateCustomerThreads(w);assert.deepEqual(w,before);assert.equal(C.validateWorld(w),w);
});
test('按版本号迁移旧交稿，客户名单随存档保留',()=>{
 const w=C.newWorld();w.artistActivated=true;const a=C.incoming(w);C.acceptIncoming(w,a.id);const v=C.placeholder(w,a.id,'稿件');const m=w.messages['artist:'+a.clientId].pop();delete m.orderId;w.messages['artist:self']=[m];C.migrateCustomerThreads(w);assert.ok(w.messages['artist:'+a.clientId].some(m=>m.versionId===v.id));assert.equal(w.messages['artist:self'],undefined);const copy=structuredClone(w);assert.equal(C.contact(copy,a.clientId).name,a.clientName);
});
