export const relayPresets={
    'rinko-nai':{label:'Rinko · NAI 中转（/nai）',kinds:['image'],values:{url:'https://api.rinko.ai/nai',imageProtocol:'novelai',modelsPath:'/v1/models',requestPath:'ai/generate-image',apiAuth:'bearer',model:'nai-diffusion-4-5-full',extraParams:''}},
    'ynai-rinko':{label:'Rinko · YesNovelAI（ynai）',kinds:['image'],values:{url:'https://ynai.rinko.ai',imageProtocol:'novelai',modelsPath:'/v1/models',requestPath:'/v1/nai/generate-image',apiAuth:'bearer',model:'nai-diffusion-4-5-full',extraParams:''}},
    'nai-rinko':{label:'Rinko · YesNovelAI（nai）',kinds:['image'],values:{url:'https://nai.rinko.ai',imageProtocol:'novelai',modelsPath:'/v1/models',requestPath:'/v1/nai/generate-image',apiAuth:'bearer',model:'nai-diffusion-4-5-full',extraParams:''}},
    'tang-nai':{label:'砂糖 Tang · NovelAI',kinds:['image'],values:{url:'https://tang.iisbo.com/novelai',imageProtocol:'novelai',modelsPath:'/v1/models',requestPath:'ai/generate-image',apiAuth:'bearer',model:'nai-diffusion-4-5-full',extraParams:''}},
    'rinko':{label:'Rinko · OpenAI 兼容',kinds:['chat','prompt','image'],values:{url:'https://api.rinko.ai/v1',textProtocol:'chat',imageProtocol:'images',modelsPath:'',requestPath:'',apiAuth:'bearer',imageSizeMode:'default',imageResponse:'auto',extraParams:''}},
    'gcli':{label:'GG 公益站 · OpenAI 兼容',kinds:['chat','prompt'],values:{url:'https://gcli.ggchan.dev/v1',textProtocol:'chat',modelsPath:'',requestPath:'',apiAuth:'bearer',extraParams:''}}
};
export function bindRelayPresets(app){
    app.addEventListener('change',event=>{
        const selected=event.target.closest('[data-relay-preset]');if(!selected)return;
        const preset=relayPresets[selected.value],box=selected.closest('[data-api-kind]'),kind=box?.dataset.apiKind;
        if(!preset?.kinds.includes(kind))return;
        for(const [field,value] of Object.entries({mode:'openai',...preset.values})){
            const input=box.querySelector(`[name="${kind}.${field}"]`);if(input){input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));}
        }
        box.querySelector('[data-model-status]').textContent='已填入站点预设；请填写该站密钥并拉取模型，检查设置后保存。预设不会自动发起请求。';
        selected.value='';
    });
}
