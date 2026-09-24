import type { WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';

export function shouldArchiveOccupiedBatch(itemCount: number, archiveIfOccupied: boolean) {
  return archiveIfOccupied && itemCount > 0;
}

/** blob: 刷新后失效；超长 data: 不适合作为可恢复成图。 */
export function isEphemeralResultUrl(url?: string): boolean {
  if (!url) return false;
  if (url.startsWith('blob:')) return true;
  return url.startsWith('data:') && url.length > 800;
}

function settleInterruptedPipeline(
  pipeline: WorkshopSnapshot['pipeline'],
  items: WorkshopSnapshot['items'],
): WorkshopSnapshot['pipeline'] {
  const status = pipeline.status;
  if (status !== 'generating' && status !== 'paused' && status !== 'analyzing' && status !== 'collecting') {
    return pipeline;
  }
  if (status === 'analyzing') return { ...pipeline, status: 'review_required' };
  if (status === 'collecting') {
    return { ...pipeline, status: items.some((item) => item.status === 'success') ? 'plan_ready' : 'draft' };
  }
  const tasks = items.flatMap((item) => item.tasks);
  const failed = tasks.some((task) => task.status === 'FAILURE');
  const succeeded = tasks.some((task) => task.status === 'SUCCESS' && Boolean(task.resultUrl));
  if (failed) return { ...pipeline, status: 'partial_failed' };
  if (succeeded) return { ...pipeline, status: 'qc_required' };
  return { ...pipeline, status: 'draft' };
}

/** Recovery never calls a model, and never treats an uncertain submission as retryable. */
export function recoverWorkspace(snapshot: WorkshopSnapshot): WorkshopSnapshot {
  const items = snapshot.items.map(item => ({
    ...item,
    status: item.status === 'collecting' ? 'pending' : item.status,
    isAnalyzing: false, isRefParsing: false, isCopywritingGenerating: false,
    ...(item.isAnalyzing ? { analyzedSuccess: false, analysisError: '上次分析中断，请检查后重新分析' } : {}),
    tasks: item.tasks.map(task => {
      if (task.status === 'IN_PROGRESS' || task.status === 'PENDING') {
        return { ...task, status: 'FAILURE' as const, recoveryRequired: true, error: '上次任务结果待核实，不会自动重新提交' };
      }
      if (task.status === 'SUCCESS' && (isEphemeralResultUrl(task.resultUrl) || !task.resultUrl)) {
        return { ...task, status: 'FAILURE' as const, resultUrl: undefined, recoveryRequired: false, error: '图片已失效，请重新生成' };
      }
      return task;
    }),
  }));
  return { ...snapshot, items, pipeline: settleInterruptedPipeline(snapshot.pipeline, items) };
}
