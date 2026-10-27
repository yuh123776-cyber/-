import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionSnapshot} from '../api-profiles.js';
test('API snapshots exclude credentials, profile metadata and unrelated world instructions',()=>{
 const source={mode:'openai',url:'https://example.test/v1',model:'model',apiAuth:'bearer',requestPath:'',imageProtocol:'novelai',width:832,height:1216,steps:28,cfg:5,key:'private-key',secret:'private-key',apiProfileId:'local-id',profileName:'Name',template:'private prompt',instructions:'private instructions'};
 const image=connectionSnapshot(source,'image');assert.equal(image.model,'model');assert.equal(image.width,832);
 for(const key of ['key','secret','apiProfileId','profileName','template','instructions'])assert.equal(key in image,false);
 assert.equal('width' in connectionSnapshot(source,'chat'),false);
 assert.equal(source.secret,'private-key');
});
