const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function contactPlaceholder(name='客'){
    const hue=Array.from(name).reduce((n,c)=>n+c.charCodeAt(0),0)%360;
    return `<svg viewBox="0 0 48 48" aria-hidden="true" style="color:hsl(${hue} 38% 55%)"><rect width="48" height="48" rx="16" fill="currentColor" opacity=".15"/><text x="24" y="31" text-anchor="middle" font-size="22" fill="currentColor">${E(name.slice(0,1))}</text></svg>`;
}
export const bubbleStyles=[['soft','柔软圆角'],['round','圆润糖果'],['outline','清透描边'],['paper','便笺纸'],['pixel','像素对话框']];
export function applyChatStyle(app,style){
    app.dataset.bubble=bubbleStyles.some(([key])=>key===style.bubbleStyle)?style.bubbleStyle:'soft';
    for(const [key,css] of [['selfBubble','--hy-self-bubble'],['otherBubble','--hy-other-bubble']]){
        if(/^#[0-9a-f]{6}$/i.test(style[key]||''))app.style.setProperty(css,style[key]);else app.style.removeProperty(css);
    }
    app.style.setProperty('--hy-bubble-radius',`${Math.max(0,Math.min(32,Number.isFinite(Number(style.bubbleRadius))?Number(style.bubbleRadius):18))}px`);
    let node=document.getElementById('hy-chat-custom-style');if(!node){node=document.createElement('style');node.id='hy-chat-custom-style';document.head.append(node);}node.textContent='';
    if(!style.chatCSS)return;
    try{const sheet=new CSSStyleSheet();sheet.replaceSync(style.chatCSS);node.textContent=Array.from(sheet.cssRules).filter(rule=>rule.type===1&&!/url\s*\(|@import|expression/i.test(rule.cssText)).map(rule=>`${rule.selectorText.split(',').map(s=>'#hy-app .hy-chat '+s.trim()).join(',')}{${rule.style.cssText}}`).join('\n');}catch{}
}
