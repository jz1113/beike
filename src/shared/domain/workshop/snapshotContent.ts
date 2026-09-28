import type { WorkshopBatchStatus } from './workshopPipeline/states';

type SnapshotContent = {
  currentStage: number;
  pipeline?: { status: WorkshopBatchStatus };
  items: Array<{
    status: string;
    prompts?: unknown[];
    tasks?: Array<{ status: string; resultUrl?: string }>;
  }>;
};

export function stageForSnapshotContent(snapshot: SnapshotContent): number {
  const items = snapshot.items || [];
  const hasImages = items.some((item) => (item.tasks || []).some((task) => task.status === 'SUCCESS' && Boolean(task.resultUrl) && !task.resultUrl?.startsWith('blob:')));
  if (hasImages) return 4;
  if (items.some((item) => (item.prompts || []).length > 0)) return 3;
  if (items.some((item) => item.status === 'success')) return 2;
  return 1;
}

export function statusForSnapshot(snapshot: SnapshotContent): WorkshopBatchStatus {
  if (snapshot.pipeline?.status) return snapshot.pipeline.status;
  if (snapshot.items.length === 0) return 'draft';
  if (snapshot.currentStage === 1) return 'collecting';
  if (snapshot.currentStage === 2) return 'plan_ready';
  if (snapshot.currentStage === 3) return 'review_required';
  return 'generating';
}
