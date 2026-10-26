// Modal dialogs make controls elsewhere in body inert regardless of z-index.
// Keep the entry in the active modal, with a top-layer popover where supported.
export function floatingEntry(button){
    let visible=false,size=64,pending=false;
    const positionKey='huiyue-launcher-position-v1';
    let position=null,drag=null,suppressUntil=0;
    try{const saved=JSON.parse(localStorage.getItem(positionKey));if(saved&&[saved.x,saved.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))position=saved;}catch{ /* Position memory is optional when storage is blocked. */ }
    button.style.touchAction='none';button.style.userSelect='none';button.draggable=false;
    button.title+=' · 按住拖动';
    const order=[];
    const popover=typeof button.showPopover==='function';
    if(popover)button.setAttribute('popover','manual');
    function host(){
        const dialogs=[...document.querySelectorAll('dialog[open]')].filter(dialog=>dialog.id!=='hy-app');
        for(const dialog of dialogs)if(!order.includes(dialog))order.push(dialog);
        for(let i=order.length-1;i>=0;i--)if(!order[i].isConnected||!order[i].open)order.splice(i,1);
        return order.at(-1)||document.body;
    }
    function sync(show=visible,nextSize=size){
        visible=show;size=nextSize;
        const parent=host();
        if(button.parentElement!==parent){
            if(popover&&button.matches(':popover-open'))button.hidePopover();
            parent.append(button);
        }
        const view=window.visualViewport;
        const width=view?.width||innerWidth,height=view?.height||innerHeight,left=view?.offsetLeft||0,top=view?.offsetTop||0;
        const actualSize=Math.min(size,Math.max(24,width-16),Math.max(24,height-16));
        button.style.setProperty('position','fixed','important');
        button.style.setProperty('inset','auto','important');
        button.style.setProperty('margin','0','important');
        const minX=left+8,minY=top+8,maxX=Math.max(minX,left+width-actualSize-8),maxY=Math.max(minY,top+height-actualSize-8);
        const x=position?minX+position.x*(maxX-minX):Math.max(minX,maxX-4);
        const y=position?minY+position.y*(maxY-minY):Math.max(minY,top+height-actualSize-(height>400?90:12));
        button.style.setProperty('left',x+'px','important');
        button.style.setProperty('top',y+'px','important');
        button.style.setProperty('width',actualSize+'px','important');
        button.style.setProperty('height',actualSize+'px','important');
        button.style.setProperty('min-width','0','important');
        button.style.setProperty('min-height','0','important');
        button.style.setProperty('max-width','none','important');
        button.style.setProperty('max-height','none','important');
        button.style.setProperty('visibility','visible','important');
        button.style.setProperty('opacity','1','important');
        button.style.setProperty('pointer-events','auto','important');
        button.style.setProperty('display',visible?'grid':'none','important');
        button.hidden=!visible;
        if(popover){
            try{if(visible&&!button.matches(':popover-open'))button.showPopover();else if(!visible&&button.matches(':popover-open'))button.hidePopover();}catch{ /* Parent dialog can close between mutation delivery and display. */ }
        }
    }
    function schedule(){if(pending)return;pending=true;queueMicrotask(()=>{pending=false;sync();});}
    const observer=new MutationObserver(records=>{
        let changed=!button.isConnected;
        for(const {target,attributeName} of records)if(attributeName==='open'&&target instanceof HTMLDialogElement&&target.open&&target.id!=='hy-app'){
            const index=order.indexOf(target);if(index>=0)order.splice(index,1);order.push(target);
        }
        for(const record of records){
            if(record.attributeName==='open')changed=true;
            for(const node of [...record.addedNodes,...record.removedNodes])if(node.nodeType===1&&(node.matches('dialog')||node.querySelector('dialog')||node.contains(button)))changed=true;
        }
        if(changed)schedule();
    });
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
    window.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('scroll',schedule);
    button.addEventListener('pointerdown',event=>{
        if(!visible||drag||event.button!==0||event.isPrimary===false)return;
        const rect=button.getBoundingClientRect();
        suppressUntil=0;drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,moved:false};
        try{button.setPointerCapture(event.pointerId);}catch{ /* Document listeners also cover capture-unavailable browsers. */ }
    });
    document.addEventListener('pointermove',event=>{
        if(!drag||event.pointerId!==drag.id)return;
        const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
        if(!drag.moved&&Math.hypot(dx,dy)<6)return;
        drag.moved=true;event.preventDefault();button.classList.add('hy-launcher-dragging');
        const view=window.visualViewport,rect=button.getBoundingClientRect();
        const left=(view?.offsetLeft||0)+8,top=(view?.offsetTop||0)+8;
        const maxX=Math.max(left,(view?.offsetLeft||0)+(view?.width||innerWidth)-rect.width-8);
        const maxY=Math.max(top,(view?.offsetTop||0)+(view?.height||innerHeight)-rect.height-8);
        const x=Math.max(left,Math.min(maxX,drag.left+dx)),y=Math.max(top,Math.min(maxY,drag.top+dy));
        position={x:maxX>left?(x-left)/(maxX-left):0,y:maxY>top?(y-top)/(maxY-top):0};sync();
    },{capture:true,passive:false});
    function finish(event){
        if(!drag||event.pointerId!==drag.id)return;
        const previous=drag;drag=null;button.classList.remove('hy-launcher-dragging');
        if(previous.moved){suppressUntil=performance.now()+500;event.preventDefault?.();try{localStorage.setItem(positionKey,JSON.stringify(position));}catch{ /* Drag still works without persistence. */ }}
        try{if(button.hasPointerCapture(previous.id))button.releasePointerCapture(previous.id);}catch{ /* A removed host dialog may already have released capture. */ }
    }
    document.addEventListener('pointerup',finish,true);
    document.addEventListener('pointercancel',finish,true);
    button.addEventListener('lostpointercapture',finish);
    button.addEventListener('click',event=>{if(event.detail!==0&&performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
    button.addEventListener('dragstart',event=>event.preventDefault());
    button.addEventListener('contextmenu',event=>event.preventDefault());
    return {sync,resetPosition(){position=null;try{localStorage.removeItem(positionKey);}catch{ /* Position memory is optional. */ }sync();}};
}
