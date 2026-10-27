import {connectionFields,automaticProfile} from './auto-connect.js?v=1.3.1';
export function bindModelPickers(app,api){
    const pending=new WeakMap(),discovered=new WeakMap();
    const control=(box,kind,field)=>box.querySelector(`[name="${kind}.${field}"]`);
    function apply(box,kind,settings){
        for(const field of ['url',...connectionFields]){const input=control(box,kind,field);if(input&&settings[field]!==undefined)input.value=settings[field];}
    }
    function clear(box,kind,resetModel=false){
        pending.get(box)?.abort();pending.delete(box);discovered.delete(box);
        const select=control(box,kind,'model'),value=resetModel?'':select.value;
        select.replaceChildren(new Option(value||'请先拉取模型',value));select.disabled=false;
        const button=box.querySelector('[data-fetch-models]');
        delete button.dataset.connecting;button.disabled=control(box,kind,'mode').value!=='openai';button.textContent='拉取模型并连接';
        box.querySelector('[data-model-status]').textContent=button.disabled?'使用酒馆当前连接；填写站点 URL 可切换到独立 API。':'填写该站密钥，点击拉取；插件自动配置接口，选择模型后保存。';
    }
    for(const type of ['input','change'])app.addEventListener(type,event=>{
        const box=event.target.closest('[data-api-kind]');if(!box)return;
        const kind=box.dataset.apiKind;
        if(event.target.name===`${kind}.url`){
            if(event.target.value.trim())control(box,kind,'mode').value='openai';
            clear(box,kind,true);
            try{apply(box,kind,{...automaticProfile(event.target.value,kind).settings,url:event.target.value});}catch{}
        }else if([`${kind}.mode`,`${kind}.key`].includes(event.target.name))clear(box,kind);
        if(event.target===control(box,kind,'model')){
            const settings=discovered.get(box)?.configurations[event.target.value];if(settings)apply(box,kind,settings);
        }
    });
    app.addEventListener('click',async event=>{
        const button=event.target.closest('[data-fetch-models]');if(!button||button.disabled)return;
        event.preventDefault();
        const box=button.closest('[data-api-kind]'),kind=box.dataset.apiKind,controller=new AbortController();
        pending.get(box)?.abort();pending.set(box,controller);
        const status=box.querySelector('[data-model-status]'),select=control(box,kind,'model');
        button.disabled=true;button.dataset.connecting='true';button.textContent='正在连接…';status.textContent='正在识别站点并读取模型列表…';
        let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},20000);
        const current=()=>box.isConnected&&pending.get(box)===controller;
        try{
            const result=await api.connect({url:control(box,kind,'url').value.trim()},kind,controller.signal,control(box,kind,'key').value);
            if(!current()||controller.signal.aborted)return;
            discovered.set(box,result);
            const previous=select.value;
            select.replaceChildren(new Option('请选择模型',''),...result.models.map(id=>new Option(id,id)));
            select.value=result.models.includes(previous)?previous:result.models.length===1?result.models[0]:'';
            const settings=result.configurations[select.value||result.models[0]];apply(box,kind,settings);
            select.disabled=false;
            status.textContent=result.verified?`已识别${result.label}，读取到 ${result.models.length} 个模型。接口已自动配置，选择模型后保存。`:`已识别${result.label}，但站点未提供可读取的模型列表；下方为常用 NAI 参考模型，连接尚未验证。请选择站点支持的模型后保存。`;
        }catch(error){
            if(current()&&(!controller.signal.aborted||timedOut))status.textContent=timedOut?'连接超时，请检查站点 URL 和网络后重试。':error.message;
        }finally{
            clearTimeout(timer);
            if(current()){pending.delete(box);delete button.dataset.connecting;button.disabled=control(box,kind,'mode').value!=='openai';button.textContent='拉取模型并连接';}
        }
    });
}
