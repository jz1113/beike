import type { StudioScene } from './types';
import type { GenerationTask } from '@client/store';
type Node=StudioScene['nodes'][number];
export interface StudioTaskCommands {
  read:()=>StudioScene;
  update:(nodeId:string,expectedTaskId:string|undefined,updates:Partial<Node>)=>void;
  run:(nodeId:string)=>Promise<unknown>;
  runText?:(nodeId:string,signal:AbortSignal)=>Promise<void>;
  focus?:(nodeId:string)=>void;
  stop:(nodeId:string,taskId:string)=>void;
}

export function studioNodeTaskId(node:Node):string|undefined {
  const id=node.beikeTaskId || node.beikeLastTaskId;
  return typeof id==='string'?id:undefined;
}

/** A durable intent survives a reload between canvas persistence and history insertion. Query its original key first. */
export function recoverStudioTaskRecord(node:Node):GenerationTask|undefined {
  const record=node.beikeTaskRecord as GenerationTask|undefined;
  if(!node.isGenerating || node.beikePromptReviewPending || node.beikeTaskStopped || !record || record.id!==node.beikeTaskId
    || typeof record.model!=='string' || typeof record.prompt!=='string')return;
  return {...record,status:'IN_PROGRESS',resultUrl:undefined,submissionRecoveryRequired:true,
    failReason:'正在核对上次提交结果，请勿重复生成'};
}

/** A preview is never a durable submission intent; refresh keeps its draft without enqueueing it. */
export function recoverStudioPromptReview(node:Node):Node {
  if(!node.beikePromptReviewPending)return node;
  return {...restoreStudioTaskResult(node),isGenerating:false,beikeTaskId:undefined,beikeTaskRecord:undefined,
    beikePromptReviewPending:false,beikePromptOptimizing:false,
    settings:{...(node.settings as Record<string,unknown>||{}),_preGenerateSnapshot:undefined,isGenerating:false},
    errorMsg:'上次提示词尚未确认，视频未提交；可查看保留的草稿后重新生成'};
}

/** Native generation clears content while retaining the selected version and its original URL. */
export function restoreStudioTaskResult(node:Node):Node {
  if(node.content || !['gen-image','gen-video'].includes(node.type))return node;
  const settings=node.settings as {generationVersions?:Array<{originalUrl?:string;content?:string}>;activeGenerationVersionIndex?:number}|undefined;
  const version=settings?.generationVersions?.[settings.activeGenerationVersionIndex||0];
  const url=version?.originalUrl||version?.content||(node.type==='gen-video'?node.videoUrl:node.imageUrl);
  return typeof url==='string' && url ? {...node,content:url} : node;
}

export function stopStudioNode(node:Node,taskId:string):Node {
  if(node.beikeTaskId!==taskId)return node;
  return {...restoreStudioTaskResult(node),beikeTaskId:undefined,beikeTaskRecord:undefined,beikeLastTaskId:taskId,beikeTaskStopped:true,beikePromptOptimizing:false,...(node.beikePromptReviewPending?{beikePromptReviewPending:false}:{}),isGenerating:false,errorMsg:undefined,
    settings:{...(node.settings as Record<string,unknown>||{}),_preGenerateSnapshot:undefined,isGenerating:false,progress:0,error:undefined}};
}

/** Repair an old preflight failure without interrupting a tracked backend task. */
export function recoverStudioIdleNode(node:Node):Node {
  const settings=node.settings as Record<string,unknown>|undefined;
  return !node.isGenerating && !node.beikeTaskId && settings?.isGenerating
    ? {...node,settings:{...settings,isGenerating:false}} : node;
}

/** A rejected preflight is terminal on both native UI busy indicators. */
export function studioGenerationFailure(settings:Record<string,unknown>,message:string) {
  return {beikeTaskId:undefined,beikePromptOptimizing:false,isGenerating:false,errorMsg:message,
    settings:{...settings,_preGenerateSnapshot:undefined,isGenerating:false,progress:0,error:message}};
}
