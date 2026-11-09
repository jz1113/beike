import {getWorkspaceSecret} from '@client/shared/api/workspaceClient';
import {generationRecoveryError} from '@client/shared/api/generation/generationRecovery';
import {usageDigest} from '@client/shared/utils/usageScope';
import type {VideoPromptInput} from '@shared/domain/assistant/skills/videoPromptSkills';

export interface VideoPromptOptimization {
  compiler?: boolean;
  operationId?: string;
  operationInput?: VideoPromptInput;
  videoModel?: string;
  videoMode?: string;
  /** Editable draft and exact user-approved text; neither implies a video has been generated. */
  draft?: string;
  submitted?: string;
  inputKey?: string;
  original: string;
  optimized: string;
  warning?: string;
  skillId: string;
  revision: string;
  sourceUrl: string;
  textModel: string;
}

export interface VideoPromptContext {
 projectId:string;nodeId:string;stage:'compiler'|'video';runId:string;inputKey?:string;textModel?:string;
 previousOperationId?:string;recoveryOnly?:boolean;
 onOperation?:(id:string)=>void|Promise<void>;
 onResolved?:()=>void|Promise<void>;
}
export interface VideoPromptSnapshot {
 input:VideoPromptInput;inputKey:string;textModel:string;skillId:string;revision:string;sourceUrl:string;
}
interface PromptOperation {
 id:string;runId:string;status:'pending'|'completed'|'rejected';snapshot:VideoPromptSnapshot;
 result?:VideoPromptOptimization;
}
export const videoPromptUnknown=()=>Object.assign(generationRecoveryError('原提示词优化结果待核对，请查询原操作；不会重新调用模型'),{retryable:false});
const validId=(value:unknown):value is string=>typeof value==='string'&&/^[\w-]{1,256}$/.test(value);
function slot(context:Pick<VideoPromptContext,'projectId'|'nodeId'|'stage'>) {
 if(!context.projectId||!context.nodeId||!['compiler','video'].includes(context.stage)||typeof localStorage==='undefined')throw videoPromptUnknown();
 return 'beike.video-prompt-operation.v1:'+usageDigest(JSON.stringify([getWorkspaceSecret(),context.projectId,context.nodeId,context.stage]));
}
function read(key:string):PromptOperation|undefined {
 const raw=localStorage.getItem(key);if(!raw)return;
 const row=JSON.parse(raw) as PromptOperation,s=row?.snapshot;
 if(!validId(row?.id)||!validId(row?.runId)||!['pending','completed','rejected'].includes(row.status)
  ||!s||!s.input||typeof s.input.model!=='string'||typeof s.input.prompt!=='string'
  ||!Number.isFinite(s.input.images)||s.input.images<0||!Number.isFinite(s.input.videos)||s.input.videos<0||typeof s.textModel!=='string'||!s.textModel||typeof s.skillId!=='string'||!s.skillId||typeof s.revision!=='string'||typeof s.sourceUrl!=='string'||typeof s.inputKey!=='string'
  ||row.status==='completed'&&(!row.result||typeof row.result.optimized!=='string'||!row.result.optimized.trim()||row.result.operationId!==row.id||row.result.inputKey!==s.inputKey||row.result.original!==s.input.prompt||row.result.skillId!==s.skillId||row.result.revision!==s.revision||row.result.textModel!==s.textModel||JSON.stringify(row.result.operationInput)!==JSON.stringify(s.input)))throw videoPromptUnknown();
 return row;
}
function write(key:string,row:PromptOperation) {
 const raw=JSON.stringify(row);localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw videoPromptUnknown();
}
export function readVideoPromptOperation(context:Pick<VideoPromptContext,'projectId'|'nodeId'|'stage'>) {
 try{return read(slot(context));}catch{throw videoPromptUnknown();}
}
export function hasVideoPromptRecovery(context:Pick<VideoPromptContext,'projectId'|'nodeId'|'stage'|'recoveryOnly'>) {
 try {const row=readVideoPromptOperation(context);return context.recoveryOnly===true||row?.status==='pending';}catch{return true;}
}
/** The workspace/node/stage lock owns an uncertain intent even after parameters or channels change. */
export async function reserveVideoPromptOperation(context:VideoPromptContext,prepare:()=>{snapshot:VideoPromptSnapshot;payload:Record<string,unknown>}) {
 try {
  const key=slot(context),locks=typeof navigator==='undefined'?undefined:navigator.locks;
  if(!validId(context.runId)||!locks?.request||context.previousOperationId&&!validId(context.previousOperationId))throw videoPromptUnknown();
  const lock=<T>(fn:()=>T)=>locks.request(key,{mode:'exclusive'},fn);
  const reserved=await lock(()=>{
   const saved=read(key);
   if(saved&&(saved.status==='pending'||context.recoveryOnly||saved.runId===context.runId||context.previousOperationId!==saved.id))return {receipt:saved,fresh:false};
   // A scene identity without its original input snapshot is never a fresh intent.
   if(context.recoveryOnly||!saved&&context.previousOperationId)throw videoPromptUnknown();
   const {snapshot,payload}=prepare();
   const receipt:PromptOperation={id:context.runId,runId:context.runId,status:'pending',snapshot};
   write(key,receipt);return {receipt,fresh:true,payload};
  });
  return {...reserved,assertWorkspace:()=>{if(slot(context)!==key)throw videoPromptUnknown();},settle:(status:PromptOperation['status'],result?:VideoPromptOptimization)=>lock(()=>{
   const current=read(key);if(current?.id!==reserved.receipt.id)throw videoPromptUnknown();
   if(current.status==='completed'&&status!=='completed')return;
   write(key,{...current,status,...(result?{result}:{})});
  })};
 }catch(error){if(error instanceof Error&&'submissionRejected' in error)throw error;throw videoPromptUnknown();}
}
