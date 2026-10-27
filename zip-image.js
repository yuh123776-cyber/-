// Read one raster image from a standard ZIP without extracting files to disk.
const limit=40*1024*1024;
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export async function zipImage(bytes,signal) {
    const fail=()=>{throw Error('NAI 返回的 ZIP 损坏或使用了不支持的压缩格式');};
    if(bytes.length<22)return fail();
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
    if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))return fail();
    const count=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true);
    for(let i=0;i<count;i++){
        signal?.throwIfAborted();
        if(offset+46>bytes.length||view.getUint32(offset,true)!==0x02014b50)return fail();
        const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),crc=view.getUint32(offset+16,true),compressed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
        if(offset+46+nameLength+extraLength+commentLength>bytes.length)return fail();
        const name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLength));
        offset+=46+nameLength+extraLength+commentLength;
        const ext=name.match(/\.(png|jpe?g|webp|gif)$/i)?.[1]?.toLowerCase();if(!ext)continue;
        if(flags&1||![0,8].includes(method)||size>limit||compressed>limit||local+30>bytes.length||view.getUint32(local,true)!==0x04034b50)return fail();
        const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
        if(start+compressed>bytes.length)return fail();
        let output=bytes.slice(start,start+compressed);
        if(method===8){
            let stream;try{stream=new Blob([output]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw Error('当前浏览器无法解压 NAI 图片，请更新浏览器或使用酒馆图片扩展');}
            const reader=stream.getReader(),chunks=[];let length=0;
            const abort=()=>{void reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
            try{while(true){signal?.throwIfAborted();const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>limit||length>size){await reader.cancel();return fail();}chunks.push(value);}
                signal?.throwIfAborted();output=new Uint8Array(length);let at=0;for(const chunk of chunks){output.set(chunk,at);at+=chunk.length;}
            }finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
        }
        if(output.length!==size||crc32(output)!==crc)return fail();
        return new Blob([output],{type:ext==='jpg'||ext==='jpeg'?'image/jpeg':`image/${ext}`});
    }
    throw Error('NAI ZIP 中没有可用图片');
}
