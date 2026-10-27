import test from 'node:test';
import assert from 'node:assert/strict';
import {listModels,setKey,hasKey} from '../api.js';

test('model discovery uses current credentials, isolates kinds and normalizes lists',async()=>{
    const original=globalThis.fetch,calls=[];
    globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({data:[{id:'z'},{id:'a'},{id:'z'},null,{name:'skip'},{id:''}]});};
    try{
        setKey('chat','saved-chat');setKey('image','saved-image');
        assert.deepEqual(await listModels({url:' https://example.test/v1/// '},'chat',undefined,'draft-key'),['a','z']);
        assert.equal(calls[0].url,'https://example.test/v1/models');
        assert.equal(calls[0].options.headers.Authorization,'Bearer draft-key');
        assert.equal(calls[0].options.credentials,'omit');
        await listModels({url:'https://example.test/v1'},'image');
        assert.equal(calls[1].options.headers.Authorization,'Bearer saved-image');
        await listModels({url:'https://example.test/v1'},'prompt',undefined,'temporary');
        assert.equal(hasKey('prompt'),false);
        globalThis.fetch=async()=>Response.json({models:['model-b','model-a']});
        assert.deepEqual(await listModels({url:'https://example.test/v1'},'prompt'),['model-a','model-b']);
    }finally{globalThis.fetch=original;setKey('chat','');setKey('image','');}
});

test('model discovery reports invalid addresses, HTTP, empty and malformed responses without secrets',async()=>{
    const original=globalThis.fetch;
    try{
        await assert.rejects(listModels({url:''},'chat'),/根地址/);
        await assert.rejects(listModels({url:'file:///tmp'},'chat'),/HTTP/);
        await assert.rejects(listModels({url:'https://key@example.test'},'chat'),/密钥/);
        for(const [response,message] of [[new Response('secret',{status:401}),/HTTP 401/],[new Response('html'),/JSON/],[Response.json({data:[]}),/可用模型/],[Response.json({oops:true}),/格式/]]){
            globalThis.fetch=async()=>response;
            await assert.rejects(listModels({url:'https://example.test/v1'},'chat'),message);
        }
        globalThis.fetch=async()=>{throw Error('secret');};
        await assert.rejects(listModels({url:'https://example.test/v1'},'chat'),/跨域/);
        const controller=new AbortController();controller.abort();
        globalThis.fetch=async(_url,{signal})=>{signal.throwIfAborted();};
        await assert.rejects(listModels({url:'https://example.test/v1'},'chat',controller.signal),{name:'AbortError'});
    }finally{globalThis.fetch=original;}
});
