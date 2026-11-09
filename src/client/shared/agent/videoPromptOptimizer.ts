import {hasVideoPromptRecovery,readVideoPromptOperation,reserveVideoPromptOperation,videoPromptUnknown,type VideoPromptContext,type VideoPromptOptimization} from './videoPromptOperation';
import {selectedStoryboardPrompt,videoPromptOutput} from './videoPromptOutput';
import { apiFetch } from '@client/shared/api/apiClient';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { prepareTextOperationUsage, replayTextOperationUsage } from '@client/shared/utils/textOperationUsage';
import { useAppStore } from '@client/store';
import { modalityPickerSelections } from '@shared/domain/models/modalityStorage';
import { getEnabledMultimodalModelsFromSettings, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';
import { videoPromptMessages, videoPromptSkill, type VideoPromptInput } from '@shared/domain/assistant/skills/videoPromptSkills';

export type {VideoPromptOptimization} from './videoPromptOperation';

/** Restore the paid stage before resolving today's Skill, model or media. */
export async function recoverVideoPromptOptimization(context:VideoPromptContext,signal:AbortSignal) {
 if(!hasVideoPromptRecovery(context))return;
 return optimizeVideoPrompt(undefined,signal,{...context,recoveryOnly:true});
}
const rejected=(message:string)=>Object.assign(new Error(message),{submissionRejected:true,retryable:false});
/** Each node/stage persists its original inputs before the first paid call. */
export async function optimizeVideoPrompt(input:VideoPromptInput|undefined,signal:AbortSignal,context:VideoPromptContext):Promise<VideoPromptOptimization|undefined> {
 signal.throwIfAborted();
 if(!context)throw videoPromptUnknown();
 const existing=readVideoPromptOperation(context);
 if(!existing&&!context.recoveryOnly&&!context.previousOperationId&&input&&!videoPromptSkill(input.model,input.mode))return;
 const operation=await reserveVideoPromptOperation(context,()=>{
  const skill=input&&videoPromptSkill(input.model,input.mode),messages=input&&videoPromptMessages(input);
  if(!input||!skill||!messages)throw rejected('当前模型没有可用提示词技能');
  if(typeof context.inputKey!=='string'||!context.inputKey)throw rejected('无法核对优化输入，未调用模型');
  const picker=modalityPickerSelections('chat');
  const configured=picker??getEnabledMultimodalModelsFromSettings(readWorkflowModelsFromStorage(),'assistant');
  const selected=useAppStore.getState().assistantModel;
  const explicit=context.textModel;
  if(explicit&&!configured.some(model=>model.id===explicit))throw rejected('所选优化模型已不可用，请重新选择');
  const textModel=explicit||configured.find(model=>model.id===selected)?.id||configured[0]?.id;
  if(!textModel)throw rejected('提示词优化需要文本模型，请在模型设置中启用文本模型');
  return {snapshot:{input:structuredClone(input),inputKey:context.inputKey||'',textModel,skillId:skill.id,revision:skill.source!.revision,sourceUrl:skill.source!.url},
   payload:{model:explicit?picker?.find(model=>model.id===explicit)?.modelId||textModel:textModel,messages,max_tokens:4096,...getMultimodalClientOverrides(textModel)}};
 });
 const {receipt,fresh}=operation;let dispatched=false;
 try {
  await context.onOperation?.(receipt.id);operation.assertWorkspace();signal.throwIfAborted();
  if(receipt.status==='completed'){replayTextOperationUsage(receipt.id);return receipt.result;}
  if(receipt.status==='rejected'){await context.onResolved?.();throw rejected('原优化已明确拒绝，可按当前输入重新优化');}
  if(fresh)prepareTextOperationUsage(receipt.id,receipt.snapshot.textModel,'chat',operation.payload);
  dispatched=true;
  const response=fresh?await apiFetch('/api/generate/canvas-text',{method:'POST',signal,headers:{'Content-Type':'application/json','x-idempotency-key':receipt.id},body:JSON.stringify({...operation.payload,clientTaskId:receipt.id})})
   :await apiFetch('/api/generate/canvas-text?operationKey='+encodeURIComponent(receipt.id),{signal,cache:'no-store'});
  const data=await response.json();operation.assertWorkspace();
  if(data.operationKey&&data.operationKey!==receipt.id)throw videoPromptUnknown();
  replayTextOperationUsage(receipt.id,data.usage,false);
  if(data.submissionRejected===true&&data.submissionUnknown!==true){await operation.settle('rejected');await context.onResolved?.();throw rejected(typeof data.error==='string'?data.error:'本次优化未提交');}
  const choice=data.choices?.[0],content=choice?.message?.content;
  if(!response.ok||data.submissionUnknown===true||data.success===false||choice?.finish_reason!=='stop'||typeof content!=='string'||!content.trim())throw Object.assign(videoPromptUnknown(),{message:typeof data.error==='string'?data.error+'；'+videoPromptUnknown().message:videoPromptUnknown().message});
  const saved=receipt.snapshot;
  replayTextOperationUsage(receipt.id,data.usage,true);
  let optimized=content.trim().replace(/^```[^\n]*\n([\s\S]*?)\n```$/,'$1').trim();
  const execution=/^#{1,6}[ \t]+优化后提示词[^\n]*(?:\n|$)/m.exec(optimized);
  if(execution)optimized=optimized.slice(execution.index+execution[0].length);
  optimized=optimized.split(/^#{1,6}[ \t]+(?:优化问题|相关原则)[^\n]*$/m)[0].trim();
  if(!optimized)throw Object.assign(videoPromptUnknown(),{message:'优化稿为空，原结果待核对，不会重新提交'});
  let warning:string|undefined;
  try {optimized=videoPromptOutput(optimized,saved.input);}
  catch(error){
    const storyboard=selectedStoryboardPrompt(saved.input);
    if(!storyboard)throw error;
    optimized=storyboard;
    warning='优化稿遗漏或改写了05分镜或素材职责，已恢复完整原稿供确认。';
  }
  if(!optimized||optimized.length>20000)throw Object.assign(videoPromptUnknown(),{message:'优化稿为空或过长，原结果待核对，不会重新提交'});
  signal.throwIfAborted();
  const result:VideoPromptOptimization={operationId:receipt.id,operationInput:saved.input,inputKey:saved.inputKey,videoModel:saved.input.model,videoMode:saved.input.mode,original:saved.input.prompt,optimized,warning,skillId:saved.skillId,revision:saved.revision,sourceUrl:saved.sourceUrl,textModel:saved.textModel};
  await operation.settle('completed',result);return result;
 }catch(error){
  if(fresh&&!dispatched){await operation.settle('rejected');await context.onResolved?.();throw rejected(error instanceof Error?error.message:'优化提交前准备失败');}
  if(error instanceof Error&&('submissionRejected' in error||'recoveryRequired' in error))throw error;
  throw videoPromptUnknown();
 }
}
