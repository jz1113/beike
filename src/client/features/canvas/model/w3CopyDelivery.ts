import {apiRequest} from '@client/shared/api/apiRequest';
import {findStudioTask} from './studioTaskActions';
import type {StudioScene} from './types';

/** Sends only the completed task receipt to the local media processor. */
export async function finishW3CopyVideo(node:StudioScene['nodes'][number],signal:AbortSignal):Promise<string> {
  const task=findStudioTask(String(node.beikeLastTaskId||''));
  if(!task?.taskId||task.status!=='SUCCESS')throw new Error('找不到已完成的视频任务，模型原片已保留，请在生成任务中核对');
  signal.throwIfAborted();
  const response=await apiRequest('POST','/api/generate/video/silent',{signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({taskId:task.taskId})});
  const data:unknown=await response.json().catch(()=>null);
  signal.throwIfAborted();
  const result=data as {success?:boolean;url?:unknown;durationSec?:number;hasAudio?:boolean;error?:string}|null;
  if(!response.ok||!result?.success||typeof result.url!=='string'||!result.url.startsWith('/storage/')||result.durationSec!==15||result.hasAudio!==false)
    throw new Error(result?.error||'无声成片处理失败，模型原片已保留；请重试无声处理，无需重新生成');
  return new URL(result.url,window.location.origin).href;
}
