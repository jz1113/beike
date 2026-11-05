import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { apiFetch } from '@client/shared/api/apiClient';
import { registerDepthSubmit } from '@client/shared/api/generation/depthGeneration';
import { registerRefMedia } from '@client/shared/media/refMediaRegistry';
import { useAppStore } from '@client/store';
import type { StudioRequest } from './studioGeneration';

/** Uses the durable generation queue, including its existing submission recovery. */
export async function submitStudioDepth(request:StudioRequest, projectId:string) {
  const store=useAppStore.getState();
  if(!store.generationHistoryReady) throw new Error('生成历史尚未恢复，请稍后重试');
  if(store.generationTasks.some(task=>task.id===request.taskId)) return;
  const refs=request.refs.filter((ref):ref is {type:'video';url:string}=>typeof ref!=='string' && ref.type==='video');
  if(refs.length!==1 || request.refs.length!==1) throw new Error('深度转换需要且只接受一条参考视频');
  const environment=await apiFetch('/api/system/depth-env');
  const env=await environment.json();
  if(!environment.ok || !env.depthModelReady) throw new Error(env.message || '本机深度模型尚未就绪，请先在设置中完成环境检查');
  const url=refs[0].url;
  if(!/^(https?:\/\/|\/storage\/|data:video\/)/i.test(url)) throw new Error('参考视频地址不可用');
  const blob=await fetchMediaBlob(url);
  if(!blob.size || (blob.type && !blob.type.startsWith('video/'))) throw new Error('参考素材不是有效的视频文件');
  const file=new File([blob],'reference.mp4',{type:blob.type || 'video/mp4'});
  registerDepthSubmit(request.taskId,{file,style:'mocap',quality:'standard',mode:'depth-video'});
  registerRefMedia(url,file);
  store.addGenerationTask({id:request.taskId,canvasProjectId:projectId,title:'画布深度视频转换',prompt:'深度动作捕捉',mediaType:'depth-video',depthStyle:'mocap',model:'video-depth-anything',size:'-',quality:'standard',referenceImageUrl:url,referenceImages:[url],useReferenceImage:true,status:'IN_PROGRESS',progress:'5%',createdAt:Date.now()},false);
}
