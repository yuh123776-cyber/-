import * as P from './api-profiles.js?v=1.5.0';
import {connectionFields} from './auto-connect.js?v=1.5.0';
export function bindProfilePickers(app,notify,onRemoved){
    const control=(box,kind,key)=>box.querySelector(`[name="${kind}.${key}"]`);
    function fill(box,kind,profile){
        // Cancel a pending model discovery before replacing connection fields.
        const url=control(box,kind,'url');url.value=profile?.settings.url||'';url.dispatchEvent(new Event('input',{bubbles:true}));
        for(const key of ['mode',...connectionFields])control(box,kind,key).value=profile?.settings[key]??(key==='mode'?'openai':'');
        control(box,kind,'apiProfileId').value=profile?.id||'';
        control(box,kind,'profileName').value=profile?.name||'';
        const key=control(box,kind,'key');key.value='';key.placeholder=profile?.hasKey?'已保存；留空保留':'填写该站密钥';
        const model=control(box,kind,'model');model.replaceChildren(new Option(profile?.settings.model||'请先拉取模型',profile?.settings.model||''));
        if(kind==='image')for(const name of ['width','height','steps','cfg'])if(profile?.settings[name]!==undefined)box.closest('form').elements[name].value=profile.settings[name];
        const button=box.querySelector('[data-fetch-models]');button.disabled=control(box,kind,'mode').value!=='openai';
        box.querySelector('[data-model-status]').textContent=profile?'已载入配置；点击「保存设置」后用于后续请求。':'填写 URL 和密钥，拉取并选择模型后保存为新配置。';
    }
    function refresh(box,kind){
        const select=box.querySelector('[data-api-profiles]'),id=control(box,kind,'apiProfileId').value;
        select.replaceChildren(new Option('新增 API 配置',''),...P.listProfiles(kind).map(p=>new Option(p.name,p.id)));select.value=id;
    }
    app.addEventListener('change',event=>{
        if(!event.target.matches('[data-api-profiles]'))return;
        const box=event.target.closest('[data-api-kind]'),kind=box.dataset.apiKind;
        fill(box,kind,P.getProfile(event.target.value,kind));
    });
    app.addEventListener('click',async event=>{
        const button=event.target.closest('[data-api-profile-action]');if(!button)return;
        event.preventDefault();const box=button.closest('[data-api-kind]'),kind=box.dataset.apiKind,id=control(box,kind,'apiProfileId').value;
        try{
            if(button.dataset.apiProfileAction==='new'){fill(box,kind,null);refresh(box,kind);return;}
            if(!id)throw Error('请先选择已保存的 API');
            button.disabled=true;
            if(button.dataset.apiProfileAction==='clear'){
                await P.clearProfileKey(id,kind);
                control(box,kind,'key').value='';control(box,kind,'key').placeholder='密钥已清除，请重新填写';
                control(box,kind,'key').dispatchEvent(new Event('input',{bubbles:true}));
                notify('该配置的密钥已从本地删除');
            }else{
                await P.removeProfile(id,kind);await onRemoved(kind,id);
                if(box.isConnected){fill(box,kind,null);refresh(box,kind);}
                notify('API 配置及其密钥已删除');
            }
        }catch(error){notify(error.message,true);}finally{if(button.isConnected)button.disabled=false;}
    });
}
