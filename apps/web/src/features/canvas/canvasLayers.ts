import {apiFetch, proxyMediaUrl} from '@/shared/api/apiClient';
import {persistCanvasMedia} from './canvasMediaImport';
import type {CanvasNode} from './types';

export const orderedLayers = (nodes:CanvasNode[]) => [...nodes].sort((a,b)=>(a.layerOrder ?? 0)-(b.layerOrder ?? 0));
export function layerBounds(nodes:CanvasNode[]) {
  if(!nodes.length || nodes.some(n=>![n.x,n.y,n.width,n.height].every(Number.isFinite) || n.width<=0 || n.height<=0)) throw new Error('图层尺寸无效');
  const x=Math.min(...nodes.map(n=>n.x)), y=Math.min(...nodes.map(n=>n.y));
  return {x,y,width:Math.max(...nodes.map(n=>n.x+n.width))-x,height:Math.max(...nodes.map(n=>n.y+n.height))-y};
}

/** Composite the same visible layers, opacity and order as the canvas; keep source nodes intact. */
export async function mergeCanvasLayers(nodes:CanvasNode[]) {
  const layers=orderedLayers(nodes.filter(n=>!n.layerHidden && (n.layerOpacity ?? 1)>0 && n.imageUrl));
  if(!layers.length) throw new Error('请至少显示一个图层');
  const bounds=layerBounds(layers);
  const images:ImageBitmap[]=[];
  try {
    for(const layer of layers) {
      const response=await apiFetch(proxyMediaUrl(layer.imageUrl!),{signal:AbortSignal.timeout(30000)});
      if(!response.ok) throw new Error(`无法读取图层：${layer.title || '未命名'}`);
      images.push(await createImageBitmap(await response.blob()));
    }
    // Preserve source detail where possible, bounding memory for large canvases.
    const preferred=Math.max(...images.map((image,index)=>image.width/layers[index].width));
    const scale=Math.min(preferred,8192/bounds.width,8192/bounds.height,Math.sqrt(32_000_000/(bounds.width*bounds.height)));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.ceil(bounds.width*scale));canvas.height=Math.max(1,Math.ceil(bounds.height*scale));
    const context=canvas.getContext('2d');if(!context)throw new Error('无法合并图层');
    layers.forEach((layer,index)=>{
      context.globalAlpha=Math.max(0,Math.min(1,layer.layerOpacity ?? 1));
      context.drawImage(images[index],(layer.x-bounds.x)*scale,(layer.y-bounds.y)*scale,layer.width*scale,layer.height*scale);
    });
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG 导出失败')),'image/png'));
    const media=await persistCanvasMedia(new File([blob],'图层合并.png',{type:'image/png'}),0,0);
    return {...media,x:bounds.x+bounds.width+60,y:bounds.y,width:bounds.width,height:bounds.height,status:'success' as const};
  } finally {images.forEach(image=>image.close());}
}
