const clean=value=>String(value??'').trim().slice(0,10000);
export function effectivePresets(settings,artist,stage){
    const defaults=settings.renderDefaults||{},draft=stage==='草稿';
    function field(artistKey,globalKey,draftKey){
        if(draft&&clean(defaults[draftKey]))return {value:clean(defaults[draftKey]),source:'draft'};
        if(clean(artist?.[artistKey]))return {value:clean(artist[artistKey]),source:'artist'};
        return {value:clean(defaults[globalKey]),source:'global'};
    }
    const positive=field('promptPreset','positive','draftPositive'),negative=field('negativePreset','negative','draftNegative');
    return {positive:positive.value,negative:negative.value,positiveSource:positive.source,negativeSource:negative.source};
}
export function nextSeed(previous,random=Math.random){
    const value=Math.max(0,Math.min(2147483646,Math.floor(random()*2147483647)));
    return value===Number(previous)?(value+1)%2147483647:value;
}
export function galleryItems(world,role,kind='all'){
    return world.commissions.filter(order=>order.owner===role).flatMap(order=>order.versions.filter(version=>version.asset&&(kind==='all'||(kind==='ai'?version.source==='ai':version.source==='upload'))).map(version=>({order,version}))).reverse();
}
