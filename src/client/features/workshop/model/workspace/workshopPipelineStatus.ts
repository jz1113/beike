import type { WorkshopBatchStatus } from '@shared/domain/workshop/workshop-pipeline';
import type { BatchProductItem } from '../batchTypes';
import { isUsableWorkshopResult } from '../generation/workshopReadiness';

/** Snapshot/history status must follow actual work, not the last pause/resume click. */
export function deriveWorkshopPipelineStatus(items: BatchProductItem[], runtime: {
  collecting: boolean; analyzing: boolean; generating: boolean;
  control: 'running' | 'paused' | 'cancelled';
}): WorkshopBatchStatus {
  if (runtime.collecting || items.some(item => item.status === 'collecting')) return 'collecting';
  if (runtime.analyzing || items.some(item => item.isAnalyzing)) return 'analyzing';
  const selected = items.filter(item => item.selected);
  const tasks = selected.flatMap(item => item.tasks || []).filter(task => task.resultStatus !== 'superseded');
  if (runtime.generating || tasks.some(task => task.status === 'IN_PROGRESS')) {
    return runtime.control === 'paused' ? 'paused' : 'generating';
  }
  if (selected.some(item => item.tasks?.some(task => task.recoveryRequired)) || tasks.some(task => task.status === 'FAILURE')) return 'partial_failed';
  if (tasks.some(task => task.status === 'PENDING')) {
    return runtime.control === 'cancelled' ? 'cancelled' : 'approved';
  }
  if (tasks.length > 0 && tasks.every(isUsableWorkshopResult)) return 'qc_required';
  if (selected.some(item => item.analyzedSuccess && item.prompts?.length)) return 'review_required';
  if (selected.some(item => item.status === 'success')) return 'plan_ready';
  return 'draft';
}
