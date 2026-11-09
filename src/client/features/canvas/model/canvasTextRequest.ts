import { apiFetch } from '@client/shared/api/apiClient';
import { generationRecoveryError } from '@client/shared/api/generation/generationRecovery';
import { getWorkspaceSecret } from '@client/shared/api/workspaceClient';
import { prepareTextOperationUsage, replayTextOperationUsage } from '@client/shared/utils/textOperationUsage';
import { usageDigest } from '@client/shared/utils/usageScope';

export interface CanvasTextContext {
  usageModel?: string;
  projectId: string;
  nodeId: string;
  runId: string;
  previousOperationId?: string;
  recoveryOnly?: boolean;
  onOperation?: (id: string) => void | Promise<void>;
}
interface TextOperation { id: string; runId: string; status: 'pending' | 'completed' | 'rejected' }
const canvasTextUnknown = () => Object.assign(generationRecoveryError('原文本或05分析结果待核对，请查询原操作；不会重新提交'), {retryable:false});
const valid = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,256}$/.test(id);
const slot = (context: Pick<CanvasTextContext,'projectId'|'nodeId'>) => {
  if (!context.projectId || !context.nodeId || typeof localStorage === 'undefined') throw canvasTextUnknown();
  return 'beike.canvas.text-operation.v1:' + usageDigest(JSON.stringify([getWorkspaceSecret(),context.projectId,context.nodeId]));
};
function read(key: string): TextOperation | undefined {
  const raw=localStorage.getItem(key);
  if (!raw) return;
  const value=JSON.parse(raw) as TextOperation;
  if (!value || !valid(value.id) || !valid(value.runId) || !['pending','completed','rejected'].includes(value.status)) throw canvasTextUnknown();
  return value;
}
function write(key: string,value: TextOperation) {
  const raw=JSON.stringify(value);localStorage.setItem(key,raw);
  if (localStorage.getItem(key)!==raw) throw canvasTextUnknown();
}
export function readCanvasTextOperation(context: Pick<CanvasTextContext,'projectId'|'nodeId'>) { return read(slot(context)); }

/** A node owns its unknown operation across input changes, reloads and tabs. */
async function reserveCanvasTextOperation(context: CanvasTextContext) {
  try {
    const key=slot(context),locks=typeof navigator==='undefined'?undefined:navigator.locks;
    if (!valid(context.runId) || !locks?.request) throw canvasTextUnknown();
    if (context.previousOperationId && !valid(context.previousOperationId)) throw canvasTextUnknown();
    const locked=<T>(fn:()=>T)=>locks.request(key,{mode:'exclusive'},fn);
    const reserved=await locked(()=>{
      const saved=read(key);
      if (saved && (saved.status==='pending' || context.recoveryOnly || saved.runId===context.runId || context.previousOperationId!==saved.id)) return {receipt:saved,fresh:false};
      if (!saved && context.recoveryOnly && !context.previousOperationId) throw canvasTextUnknown();
      const legacy=!saved && context.previousOperationId;
      const receipt:TextOperation={id:legacy || context.runId,runId:context.runId,status:'pending'};
      write(key,receipt);return {receipt,fresh:!legacy && !context.recoveryOnly};
    });
    return {...reserved,assertWorkspace:()=>{if(slot(context)!==key)throw canvasTextUnknown();},settle:(status:TextOperation['status'])=>locked(()=>{
      const current=read(key);
      if(current?.id!==reserved.receipt.id)throw canvasTextUnknown();
      if(current.status==='completed'&&status!=='completed')return;
      write(key,{...current,status});
    })};
  } catch { throw canvasTextUnknown(); }
}

function validResult(data: Record<string,unknown>) {
  if(data.submissionUnknown===true || data.success===false)return false;
  if(data.success===true && typeof data.text==='string' && data.text.trim())return true;
  return Array.isArray(data.choices) && data.choices.some(choice=>{
    const message=choice?.message;
    return ['stop','tool_calls'].includes(choice?.finish_reason) && message && (typeof message.content==='string' && message.content.trim() || Array.isArray(message.tool_calls) && message.tool_calls.length>0);
  });
}
/** The body (including today's model/channel) is resolved only for a confirmed fresh operation. */
export async function requestCanvasText(body:()=>Record<string,unknown> | Promise<Record<string,unknown>>,context:CanvasTextContext,signal:AbortSignal) {
  signal.throwIfAborted();
  const operation=await reserveCanvasTextOperation(context);
  let dispatched=false;
  try {
    await context.onOperation?.(operation.receipt.id);
    operation.assertWorkspace();signal.throwIfAborted();
    let response:Response;
    if(operation.fresh) {
      const payload=await body();operation.assertWorkspace();signal.throwIfAborted();
      prepareTextOperationUsage(operation.receipt.id,context.usageModel || String(payload.model || ''),'chat',payload);
      operation.assertWorkspace();signal.throwIfAborted();dispatched=true;
      response=await apiFetch('/api/generate/canvas-text',{method:'POST',signal,headers:{'Content-Type':'application/json','x-idempotency-key':operation.receipt.id},body:JSON.stringify({...payload,clientTaskId:operation.receipt.id})});
    } else {
      dispatched=true;
      response=await apiFetch('/api/generate/canvas-text?operationKey='+encodeURIComponent(operation.receipt.id),{cache:'no-store',signal});
    }
    const data=await response.json() as Record<string,unknown>;
    operation.assertWorkspace();
    if(data.operationKey && data.operationKey!==operation.receipt.id)throw canvasTextUnknown();
    replayTextOperationUsage(operation.receipt.id,data.usage,false);
    if(response.ok && validResult(data)) {
      replayTextOperationUsage(operation.receipt.id,data.usage,true);
      await operation.settle('completed');return data;
    }
    if(data.submissionRejected===true && data.submissionUnknown!==true) {
      await operation.settle('rejected');
      throw Object.assign(new Error(typeof data.error==='string'?data.error:'本次未提交，可重新生成'),{submissionRejected:true,retryable:false});
    }
    throw canvasTextUnknown();
  } catch(error) {
    if(operation.fresh && !dispatched) {
      await operation.settle('rejected');
      throw Object.assign(error instanceof Error?error:new Error('文本提交前准备失败'),{submissionRejected:true,retryable:false});
    }
    if(error instanceof Error && 'submissionRejected' in error)throw error;
    throw canvasTextUnknown();
  }
}
