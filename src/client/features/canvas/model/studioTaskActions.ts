import { useAppStore, type GenerationTask } from '@client/store';
import { isImageTaskActive } from '@shared/domain/core/taskStatus';
import { isGenerationDispatching,stopGenerationPreparation } from '@client/shared/api/generation/generationDispatch';
import { prepareGenerationAttempt, createGenerationAttemptId } from '@client/shared/media/generationAttempt';

export function findStudioTask(taskId:string):GenerationTask|undefined {
  const state=useAppStore.getState();
  return state.generationTasks.find(task=>task.id===taskId) || state.sessions.flatMap(session=>session.tasks).find(task=>task.id===taskId);
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
  if(task.status==='SUCCESS')throw new Error('原任务已完成，可恢复结果或重新生成');
  const attempt=await prepareGenerationAttempt(task,createGenerationAttemptId('studio-retry'));
  if(!attempt)throw new Error('原参考素材无法恢复，请重新添加素材后生成');
  if(findStudioTask(taskId)!==task)throw new Error('原任务状态已更新，请重新检查后重试');
  return attempt;
}
