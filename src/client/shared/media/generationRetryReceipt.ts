import type { GenerationTask } from '@client/store';
import { isImageTaskFailed } from '@shared/domain/core/taskStatus';
import { apiFetch, storageConfigHeaders } from '@client/shared/api/apiClient';
import { getGatewayClientHeaders } from '@client/shared/api/gatewayClient';

/** Read the original receipt; never submit or retry an inconclusive operation. */
export async function queryOriginalGenerationBeforeRetry(task:GenerationTask):Promise<string | undefined> {
  if(task.mediaType!=='image' && task.mediaType!=='video')return;
  const endpoint=task.mediaType==='video'?'/api/generate/video':'/api/generate/image';
  const headers=getGatewayClientHeaders(task.modelRouteKey || task.model);
  let upstreamId=task.taskId, recordId=task.dbId, model=task.model;
  for(let phase=0;phase<2;phase++) {
    const params=new URLSearchParams(upstreamId ? {taskId:upstreamId,recheck_failed:'1'} : {taskKey:task.id,closeMissing:'true'});
    params.set('model',model);
    if(task.mediaType==='image')params.set('requireRoute','true');
    const response=await apiFetch(endpoint+'?'+params,{cache:'no-store',headers:{
      ...headers,...storageConfigHeaders(),...(recordId?{'x-task-record-id':recordId}:{}),
    }});
    const receipt=await response.json().catch(()=>null);
    if(response.ok && typeof receipt?.resultUrl==='string' && receipt.resultUrl)return receipt.resultUrl;
    if(!upstreamId && response.ok && typeof receipt?.taskId==='string' && receipt.taskId && !receipt.taskId.startsWith('pending_')){
      upstreamId=receipt.taskId;
      if(typeof receipt.model==='string' && receipt.model)model=receipt.model;
      if(typeof receipt.recordId==='string')recordId=receipt.recordId;
      continue;
    }
    if(response.ok && receipt?.submissionUnknown!==true && typeof receipt?.status==='string' && isImageTaskFailed(receipt.status))return;
    throw new Error(typeof receipt?.error==='string' && receipt.error ? receipt.error : '原任务尚未确认失败，请恢复原渠道或稍后核对；没有重新提交');
  }
}
