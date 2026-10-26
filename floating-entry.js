// Modal dialogs make controls elsewhere in body inert regardless of z-index.
// Keep the entry in the active modal, with a top-layer popover where supported.
export function floatingEntry(button){
    let visible=false,size=64,pending=false;
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
        button.style.setProperty('left',Math.max(left+8,left+width-actualSize-12)+'px','important');
        button.style.setProperty('top',Math.max(top+8,top+height-actualSize-(height>400?90:12))+'px','important');
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
    return {sync};
}
