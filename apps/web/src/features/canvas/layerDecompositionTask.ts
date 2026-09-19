import {apiFetch} from '@/lib/apiClient';
import {parseDecomposedLayers, type DecomposedLayer} from '@beike/domain/layerDecomposition';
import {useCanvasStore} from './store/useCanvasStore';
import type {CanvasNode} from './types';

export async function runLayerDecompositionTask(projectId:string, source:CanvasNode, prepare:()=>Promise<string>, prompt:string, operation:string) {
  const store=useCanvasStore.getState();
  if (!store.projects.some(p=>p.id===projectId)) return;
  const id=`layer-task-${operation}`;
  if (store.projects.find(p=>p.id===projectId)?.nodes.some(n=>n.id===id)) return;
  store.addNode(projectId,{id,type:'image',title:`${source.title || '图片'} · 图层分离`,x:source.x+source.width+80,y:source.y,width:source.width,height:source.height,status:'generating',referenceNodeIds:[source.id],referenceImageUrl:source.imageUrl,model:'seedream-v5-pro/layer-decomposition',content:prompt,layerTask:true});
  try {
    const image=await prepare();
    const response=await apiFetch('/api/generate/layer-decomposition',{method:'POST',headers:{'Content-Type':'application/json','x-idempotency-key':operation},body:JSON.stringify({model:'seedream-v5-pro/layer-decomposition',image,prompt,size:'auto'})});
    const result=await response.json();
    if(!response.ok || !result.success)throw new Error(result.error || '图层拆分失败');
    const layers:DecomposedLayer[]=result.layers;
    // Revalidate the complete result before mutating the canvas.
    parseDecomposedLayers({data:layers.map(l=>l.placement==='separate'?{url:l.url}:{url:l.url,size:`${l.width}x${l.height}`,z_index:l.zIndex,bounding_box:l.bounds?{absolute:l.bounds}:undefined})});
    const current=useCanvasStore.getState();
    const target=current.projects.find(p=>p.id===projectId)?.nodes.find(n=>n.id===id);
    if(!target)return;
    if (layers.every(layer=>layer.placement==='separate')) {
      // Missing coordinates cannot be reconstructed reliably; keep every output visible.
      layers.forEach((layer,index)=>{
        const width=target.width;
        const height=layer.width>0 && layer.height>0 ? width*layer.height/layer.width : (target.height || width);
        const fields={layerGroupId:id,layerOrder:index,imageUrl:layer.url,status:'success' as const,width,height,title:`${source.title || '图片'} · ${layer.name}`,layerTask:false,referenceNodeIds:[source.id]};
        if(index===0) current.updateNode(projectId,id,fields);
        else current.addNode(projectId,{...fields,type:'image',x:target.x+index*(width+40),y:target.y,model:'seedream-v5-pro/layer-decomposition'});
      });
      return;
    }
    const base=layers.find(l=>l.zIndex===0)!;
    const scale=target.width/base.width;
    current.updateNode(projectId,id,{layerGroupId:id,layerOrder:0,imageUrl:base.url,status:'success',height:base.height*scale,title:`${source.title || '图片'} · 底图`,layerTask:false});
    layers.filter(l=>l.zIndex>0).sort((a,b)=>a.zIndex-b.zIndex).forEach(layer=>{
      const [left,top]=layer.bounds!;
      current.addNode(projectId,{layerGroupId:id,layerOrder:layer.zIndex,type:'image',title:layer.name,imageUrl:layer.url,x:target.x+left*scale,y:target.y+top*scale,width:layer.width*scale,height:layer.height*scale,status:'success',model:'seedream-v5-pro/layer-decomposition'});
    });
  } catch(error) {
    useCanvasStore.getState().updateNode(projectId,id,{status:'error',content:error instanceof Error?error.message:'图层拆分失败'});
  }
}
