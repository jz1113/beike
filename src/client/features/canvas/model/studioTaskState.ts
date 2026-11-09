import { useAppStore, type ChatSession, type GenerationTask } from '@client/store';
import { isImageTaskActive, isImageTaskFailed } from '@shared/domain/core/taskStatus';
import { isGenerationDispatching, stopGenerationPreparation } from '@client/shared/api/generation/generationDispatch';
import { queryOriginalGenerationBeforeRetry } from '@client/shared/media/generationRetryReceipt';
import { prepareGenerationAttempt, createGenerationAttemptId } from '@client/shared/media/generationAttempt';
import { studioNodeLabel } from './studioConnections';
import type { StudioScene } from './types';

type Node = StudioScene['nodes'][number];
type Kind = 'image' | 'video' | 'audio';

export interface StudioTaskCommands {
  read:()=>StudioScene;
  connect?:(connections:StudioScene['connections'])=>void;
  insert?:(node:Node)=>void;
  update:(nodeId:string,expectedTaskId:string|undefined,updates:Partial<Node>)=>void;
  run:(nodeId:string,signal?:AbortSignal)=>Promise<unknown>;
  runCompiler?:(nodeId:string)=>Promise<boolean>;
  runText?:(nodeId:string,signal:AbortSignal)=>Promise<void>;
  focus?:(nodeId:string)=>void;
  stop:(nodeId:string,taskId:string)=>void;
}

export interface StudioHistoryEntry {
  id:string; kind:Kind; title:string; createdAt:number; prompt?:string; model?:string;
  result?:string; task?:GenerationTask; node?:Node;
}

export function studioNodeTaskId(node:Node):string|undefined {
  const id=node.beikeTaskId || node.beikeLastTaskId;
  return typeof id==='string'?id:undefined;
}

/** A durable intent survives a reload between canvas persistence and history insertion. Query its original key first. */
export function recoverStudioTaskRecord(node:Node):GenerationTask|undefined {
  const record=node.beikeTaskRecord as GenerationTask|undefined;
  const taskId=node.beikeTaskStopped ? node.beikeLastTaskId : node.isGenerating ? node.beikeTaskId : undefined;
  if(node.beikePromptReviewPending || !record || record.id!==taskId
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
  return {...restoreStudioTaskResult(node),beikeTaskId:undefined,beikeTaskRecord:node.beikeTaskRecord,beikeLastTaskId:taskId,beikeTaskStopped:true,beikePromptOptimizing:false,...(node.beikePromptReviewPending?{beikePromptReviewPending:false}:{}),isGenerating:false,errorMsg:undefined,
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

export function findStudioTask(taskId:string):GenerationTask|undefined {
  const state=useAppStore.getState();
  return state.generationTasks.find(task=>task.id===taskId) || state.sessions.flatMap(session=>session.tasks).find(task=>task.id===taskId);
}

/** Stopping the canvas spinner does not cancel a submitted operation. */
export function studioMediaRunBlock(taskId: unknown, hasReceipt = false): string | undefined {
  if(!useAppStore.getState().generationHistoryReady)return '生成历史仍在恢复，请稍后重试';
  const task=typeof taskId==='string'?findStudioTask(taskId):undefined;
  if(task ? task.submissionRecoveryRequired || isImageTaskActive(task.status) : hasReceipt)
    return '原任务仍在执行或核对中，请在生成任务面板继续等待';
}

/** A dispatched request must keep its receipt and recovery path; only an unsubmitted job can be cancelled. */
export function stopStudioTask(taskId:string):void {
  const task=findStudioTask(taskId);
  if(!task){stopGenerationPreparation(taskId);return;}
  if(!task || !isImageTaskActive(task.status) || task.taskId || task.submissionRecoveryRequired || isGenerationDispatching(task.id))return;
  useAppStore.getState().updateGenerationTask(task.id,{status:'FAILURE',progress:'0%',failReason:'已取消，任务尚未提交'});
  stopGenerationPreparation(task.id);
}

export async function prepareStudioRetry(taskId:string):Promise<GenerationTask> {
  const task=findStudioTask(taskId);
  if(!task)throw new Error('找不到原任务，请检查参考素材后重新生成');
  if(task.submissionRecoveryRequired || isImageTaskActive(task.status))throw new Error('原任务仍在执行或核对中，请继续等待原任务');
  if(task.status==='SUCCESS' || task.resultUrl)throw new Error('原任务已完成，可恢复结果或重新生成');
  if(!isImageTaskFailed(task.status))throw new Error('原任务尚未确认失败，不能重新提交');
  const resultUrl=await queryOriginalGenerationBeforeRetry(task);
  if(findStudioTask(taskId)!==task)throw new Error('原任务状态已更新，请重新检查后重试');
  if(resultUrl){
    useAppStore.getState().updateGenerationTask(task.id,{status:'SUCCESS',progress:'100%',resultUrl,failReason:undefined,submissionRecoveryRequired:false});
    throw new Error('原任务已完成，请恢复原结果；没有重新提交');
  }
  const attempt=await prepareGenerationAttempt(task,createGenerationAttemptId('studio-retry'));
  if(!attempt)throw new Error('原参考素材无法恢复，请重新添加素材后生成');
  if(findStudioTask(taskId)!==task)throw new Error('原任务状态已更新，请重新检查后重试');
  return attempt;
}

function settingsOf(node:Node) { return (node.settings || {}) as Record<string,unknown>; }

/** Only our local file handler accepts thumbnail parameters; keep signed remote URLs intact. */
export function studioHistoryThumbnail(source:string,origin:string):string {
  try {
    const url=new URL(source,origin);
    if(url.origin!==origin || !url.pathname.startsWith('/storage/local/'))return source;
    url.searchParams.set('thumb','1');
    url.searchParams.set('w','384');
    return url.href;
  } catch {
    return source;
  }
}

export function studioProjectGenerationHistory(projectId:string,scene:StudioScene,tasks:GenerationTask[],sessions:ChatSession[]) {
  const byTask=new Map<string,StudioHistoryEntry>();
  const nodesByTask=new Map<string,Node>();
  const versions:StudioHistoryEntry[]=[];
  for(const node of scene.nodes) {
    const settings=settingsOf(node);
    if(node.type!=='gen-image' && node.type!=='gen-video' && node.type!=='gen-speech')continue;
    if(settings.beikeOperation)continue;
    const currentId=studioNodeTaskId(node);
    if(currentId)nodesByTask.set(currentId,node);
    if(!Array.isArray(settings.generationVersions))continue;
    for(const [index,version] of settings.generationVersions.entries()) {
      if(!version || typeof version!=='object')continue;
      const result=version.originalUrl || version.content;
      if(typeof result!=='string'||!result)continue;
      const id=typeof version.id==='string'&&version.id?version.id:`${node.id}:version:${index}`;
      nodesByTask.set(id,node);
      versions.push({id,kind:node.type==='gen-video'?'video':node.type==='gen-speech'?'audio':'image',node,
        title:studioNodeLabel(node),result,createdAt:Number(version.createdAt)||0,
        prompt:typeof version.recipe?.prompt==='string'?version.recipe.prompt:undefined,
        model:typeof version.recipe?.settings?.model==='string'?version.recipe.settings.model:undefined});
    }
  }
  const add=(task:GenerationTask,sessionProject?:string)=>{
    if((task.canvasProjectId || sessionProject || (nodesByTask.has(task.id)?projectId:undefined))!==projectId)return;
    if(!task.taskId && !task.resultUrl && task.failReason==='已取消，任务尚未提交')return;
    const kind=task.mediaType;
    if(kind!=='video'&&kind!=='audio'&&kind!=='image'&&(kind||!nodesByTask.has(task.id)))return;
    const node=nodesByTask.get(task.id);
    const inferredKind=kind || (node?.type==='gen-video'?'video':node?.type==='gen-speech'?'audio':'image');
    byTask.set(task.id,{id:task.id,kind:inferredKind,title:task.title || (node?studioNodeLabel(node):'生成任务'),
      createdAt:task.createdAt || 0,model:task.model,prompt:task.prompt,result:task.resultUrl || task.outputUrl,task,node});
  };
  for(const session of sessions)for(const task of session.tasks)add(task,session.canvasProjectId);
  for(const task of tasks)add(task);
  for(const version of versions) {
    const entry=byTask.get(version.id);
    if(!entry)byTask.set(version.id,version);
    else byTask.set(version.id,{...version,...entry,createdAt:entry.createdAt || version.createdAt,result:entry.result || version.result});
  }
  return [...byTask.values()].sort((a,b)=>b.createdAt-a.createdAt);
}
