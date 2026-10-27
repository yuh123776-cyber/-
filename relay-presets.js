// Internal known-site profiles; compatibility controls are not rendered.
export const relayPresets={
    'rinko-nai':{label:'Rinko · NAI 中转（/nai）',kinds:['image'],values:{url:'https://api.rinko.ai/nai',imageProtocol:'novelai',modelsPath:'/v1/models',requestPath:'ai/generate-image',apiAuth:'bearer',model:'nai-diffusion-4-5-full',extraParams:''}},
    'ynai-rinko':{label:'Rinko · YesNovelAI（ynai）',kinds:['image'],values:{url:'https://ynai.rinko.ai',imageProtocol:'novelai',modelsPath:'/v1/models',requestPath:'/v1/nai/generate-image',apiAuth:'bearer',model:'nai-diffusion-4-5-full',extraParams:''}},
    'nai-rinko':{label:'Rinko · YesNovelAI（nai）',kinds:['image'],values:{url:'https://nai.rinko.ai',imageProtocol:'novelai',modelsPath:'/v1/models',requestPath:'/v1/nai/generate-image',apiAuth:'bearer',model:'nai-diffusion-4-5-full',extraParams:''}},
    'tang-nai':{label:'砂糖 Tang · NovelAI',kinds:['image'],values:{url:'https://tang.iisbo.com/novelai',imageProtocol:'novelai',modelsPath:'/v1/models',requestPath:'ai/generate-image',apiAuth:'bearer',model:'nai-diffusion-4-5-full',extraParams:''}},
    'rinko':{label:'Rinko · OpenAI 兼容',kinds:['chat','prompt','image'],values:{url:'https://api.rinko.ai/v1',textProtocol:'chat',imageProtocol:'images',modelsPath:'',requestPath:'',apiAuth:'bearer',imageSizeMode:'default',imageResponse:'auto',extraParams:''}},
    'gcli':{label:'GG 公益站 · OpenAI 兼容',kinds:['chat','prompt'],values:{url:'https://gcli.ggchan.dev/v1',textProtocol:'chat',modelsPath:'',requestPath:'',apiAuth:'bearer',extraParams:''}}
};
