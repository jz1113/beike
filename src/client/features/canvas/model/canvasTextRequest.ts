import { apiFetch } from '@client/shared/api/apiClient';
import { sleepWhilePolling } from '@client/shared/api/generation/generationAbort';
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
  acceptSettledIncomplete?: boolean;
  closeMissingReceipt?: boolean;
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
    let data: Record<string, unknown>;
    if(operation.fresh) {
      const payload=await body();operation.assertWorkspace();signal.throwIfAborted();
      prepareTextOperationUsage(operation.receipt.id,context.usageModel || String(payload.model || ''),'chat',payload);
      operation.assertWorkspace();signal.throwIfAborted();dispatched=true;
      response=await apiFetch('/api/generate/canvas-text',{method:'POST',signal,headers:{'Content-Type':'application/json','x-idempotency-key':operation.receipt.id},body:JSON.stringify({...payload,clientTaskId:operation.receipt.id})});
      data = await response.json();
    } else {
      dispatched=true;
      const receiptUrl = '/api/generate/canvas-text?operationKey=' + encodeURIComponent(operation.receipt.id);
      const querySignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
      for (;;) {
        operation.assertWorkspace();
        response = await apiFetch(receiptUrl, { cache: 'no-store', signal: querySignal });
        data = await response.json();
        if (response.status !== 409 || data.stage !== 'result' || data.submissionUnknown !== true || data.operationKey !== operation.receipt.id) break;
        await sleepWhilePolling(2000, () => querySignal.aborted);
      }
      if (response.status === 404 && context.closeMissingReceipt && data.operationKey === operation.receipt.id && data.submissionUnknown === true) {
        operation.assertWorkspace();
        response = await apiFetch(receiptUrl + '&closeMissing=1', { method: 'POST', signal: querySignal });
        data = await response.json();
      }
    }
    operation.assertWorkspace();
    signal.throwIfAborted();
    if(data.operationKey && data.operationKey!==operation.receipt.id)throw canvasTextUnknown();
    replayTextOperationUsage(operation.receipt.id,data.usage,false);
    if(response.ok && validResult(data)) {
      replayTextOperationUsage(operation.receipt.id,data.usage,true);
      await operation.settle('completed');return data;
    }
    // A successful final receipt with unusable output is settled, not pending.
    if(context.acceptSettledIncomplete && response.ok && data.success===true && data.submissionUnknown!==true && data.submissionRejected!==true) {
      replayTextOperationUsage(operation.receipt.id,data.usage,true);
      await operation.settle('completed');
      throw Object.assign(new Error('原请求已结束，但模型没有返回完整正文，可以重新生成'),{submissionSettled:true});
    }
    // Older servers persist the missing-key rejection without the terminal flag.
    const missingKey = response.status === 502 && data.error === '请先配置文本模型的 API Key';
    const upstreamUnauthorized = response.status === 502 && typeof data.error === 'string' &&
      /调用失败（协议 [^，]+，HTTP 401）：text upstream HTTP 401:/.test(data.error);
    // Older servers stored a confirmed upstream 401 as unknown. Only a durable
    // replay for this exact operation can override that legacy flag.
    const legacyUnauthorizedReceipt = upstreamUnauthorized && data.replayed === true && data.operationKey === operation.receipt.id;
    if(((data.submissionRejected===true || missingKey || upstreamUnauthorized) && data.submissionUnknown!==true) || legacyUnauthorizedReceipt) {
      await operation.settle('rejected');
      throw Object.assign(new Error(upstreamUnauthorized ? '文本模型拒绝了 API Key，请检查当前模型渠道的密钥后重试' : typeof data.error==='string'?data.error:'本次未提交，可重新生成'),{submissionRejected:true,retryable:false});
    }
    throw canvasTextUnknown();
  } catch(error) {
    if(operation.fresh && !dispatched) {
      await operation.settle('rejected');
      throw Object.assign(error instanceof Error?error:new Error('文本提交前准备失败'),{submissionRejected:true,retryable:false});
    }
    if(error instanceof Error && ('submissionRejected' in error || 'submissionSettled' in error))throw error;
    throw canvasTextUnknown();
  }
}
