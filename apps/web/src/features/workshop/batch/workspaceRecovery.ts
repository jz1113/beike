import type { WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';

/** Recovery never calls a model, and never treats an uncertain submission as retryable. */
export function recoverWorkspace(snapshot: WorkshopSnapshot): WorkshopSnapshot {
  return { ...snapshot, items: snapshot.items.map(item => ({
    ...item,
    status: item.status === 'collecting' ? 'pending' : item.status,
    isAnalyzing: false, isRefParsing: false, isCopywritingGenerating: false,
    ...(item.isAnalyzing ? { analyzedSuccess: false, analysisError: '上次分析中断，请检查后重新分析' } : {}),
    tasks: item.tasks.map(task => task.status === 'IN_PROGRESS' || task.status === 'PENDING'
      ? { ...task, status: 'FAILURE' as const, recoveryRequired: true, error: '上次任务结果待核实，不会自动重新提交' }
      : task),
  })) };
}
