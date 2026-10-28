const aliases={商用:'commercial',印刷:'print',vup:'vup',vtuber:'vup',买断:'buyout',工程文件:'source'};
export function parsePricingRules(source){
    if(!String(source||'').trim())return [];
    return String(source).split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map((line,index)=>{
        let match=line.match(/^(.+?)\s*[*×xX]\s*(\d+(?:\.\d+)?)$/),label,factor;
        if(match){label=match[1].trim();factor=Number(match[2]);}
        else{match=line.match(/^(.+?)\s*打\s*(\d+(?:\.\d+)?)\s*折$/);if(!match)throw Error(`定价规则「${line}」格式不正确，请用“商用 * 2”或“某IP同人打95折”`);label=match[1].trim();const n=Number(match[2]);factor=n>10?n/100:n/10;}
        if(!label||label.length>80||!Number.isFinite(factor)||factor<=0||factor>100)throw Error('定价规则的倍率应大于 0 且不超过 100');
        const ip=/同人/i.test(label),key=aliases[label.toLowerCase()]||`custom-${index}`;
        return {id:`rate-${index}`,label,factor,key,kind:ip?'ip':'usage',match:ip?label.replace(/的?同人|IP/gi,'').trim():''};
    });
}
export function rulesFor(artist){return Array.isArray(artist?.pricingRules)?artist.pricingRules:parsePricingRules(artist?.pricingRulesText);}
export function priceQuote(artist,options={}){
    const base=Number(options.basePrice??artist.min),usages=new Set(options.usages||[]);
    if(options.commercial)usages.add('commercial');
    if(!Number.isSafeInteger(base)||base<artist.min||base>artist.max)throw Error(`基础价须在 ${artist.min}–${artist.max} 绘币之间`);
    const brief=String(options.brief||'').toLowerCase(),subject=(String(options.ip||'')+' '+brief).toLowerCase(),applied=[];let factor=1,surcharge=1,ruleDiscount=1,ipApplied=false;
    const mentions=word=>{word=word.toLowerCase();const index=brief.indexOf(word);if(index<0)return false;return !/(?:不需要|无需|不用|不作|不做|非|不|无).{0,3}$/.test(brief.slice(Math.max(0,index-7),index));};
    const words={commercial:['商用','商业用途'],print:['印刷'],vup:['vup','vtuber','虚拟主播'],buyout:['买断'],source:['工程文件','源文件']};
    for(const rule of rulesFor(artist)){
        const matches=rule.kind==='ip'?(!ipApplied&&rule.match&&subject.includes(rule.match.toLowerCase())):(usages.has(rule.key)||usages.has(rule.id)||(words[rule.key]||[rule.label]).some(mentions));
        if(matches){factor*=rule.factor;if(rule.factor>=1)surcharge*=rule.factor;else ruleDiscount*=rule.factor;applied.push({...rule});if(rule.kind==='ip')ipApplied=true;}
    }
    const discount=options.discount===undefined?1:Number(options.discount);
    if(!Number.isFinite(discount)||discount<.05||discount>1)throw Error('画师自愿折扣应为 0.05–1 之间的数值');
    const required=Math.ceil(base*factor*discount-1e-8);
    if(!Number.isSafeInteger(required)||required<1||required>100000000)throw Error('规则总价超出可用范围');
    return {base,factor,discount,required,applied,beforeDiscount:Math.ceil(base*surcharge-1e-8),discountFactor:ruleDiscount*discount,summary:applied.map(rule=>`${rule.label} × ${rule.factor}`).join('；')||'基础价'};
}
export function settledOfferPrice(artist,options,discount=1){
    const pricing=priceQuote(artist,{...options,discount}),offered=Number(options.price);
    return offered>=pricing.beforeDiscount&&pricing.discountFactor<1?Math.max(pricing.required,Math.ceil(offered*pricing.discountFactor-1e-8)):offered;
}
export function validateOffer(artist,options){
    const pricing=priceQuote(artist,{...options,basePrice:options.basePrice??options.price});
    if(!Number.isSafeInteger(Number(options.price))||Number(options.price)<pricing.required)throw Error(`这份需求按「${pricing.summary}」需 ${pricing.required} 绘币，目前报价不足，画师未接受委托。`);
    return pricing;
}
