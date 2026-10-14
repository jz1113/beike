import { savedWorkshopOutputSize } from './workshopOutputSize';
import { buildImageTaskKey, resolveTaskMergeAction } from '@shared/domain/workshop/workshop-pipeline';
import type { BatchProductItem, BatchTaskItem } from '../batchTypes';

export interface MergeTaskContext {
  batchId: string;
  storyboardRevision: number;
  model: string;
  aspectRatio: string;
  quality: string;
  generationStrategy?: 'grid_first' | 'single_shot';
  gridOutputSize?: string;
}

export function mergeGenerationTasks(
  item: BatchProductItem,
  context: MergeTaskContext,
): BatchTaskItem[] {
  const shots = (item.prompts || []).filter((shot) => shot.selected !== false);
  const existing = new Map(
    (item.tasks || [])
      .map((task) => [task.idempotencyKey || task.id, task]),
  );

  return shots.map((shot, idx) => {
    const previousKey = buildImageTaskKey({
      batchId: context.batchId,
      productId: item.id,
      storyboardRevision: context.storyboardRevision,
      shotNo: shot.shot_no,
      prompt: context.generationStrategy === 'grid_first' ? `grid_first:${item.gridPrompt || ''}` : shot.prompt || '',
      selectedImageUrls: item.selectedProductImages || [],
      model: context.model,
      aspectRatio: context.aspectRatio,
      quality: context.quality,
      outputSize: context.generationStrategy === 'grid_first' ? context.gridOutputSize : undefined,
      attempt: undefined,
    });
    const previous = [...existing.values()].find((task) => {
      const stored = task.idempotencyKey || '';
      return stored === previousKey || stored.startsWith(`${previousKey}:a`);
    });
    if (previous?.recoveryRequired) return previous;
    const attempt = previous && (previous.status === 'FAILURE' || previous.resultStatus === 'superseded') ? (previous.attempt || 0) + 1 : (previous?.attempt || 0);
    const key = buildImageTaskKey({
      batchId: context.batchId,
      productId: item.id,
      storyboardRevision: context.storyboardRevision,
      shotNo: shot.shot_no,
      prompt: context.generationStrategy === 'grid_first' ? `grid_first:${item.gridPrompt || ''}` : shot.prompt || '',
      selectedImageUrls: item.selectedProductImages || [],
      model: context.model,
      aspectRatio: context.aspectRatio,
      quality: context.quality,
      outputSize: context.generationStrategy === 'grid_first' ? context.gridOutputSize : undefined,
      attempt,
    });
    const action = resolveTaskMergeAction(previous ? { key, status: previous.status } : undefined);
    if (previous && previous.resultStatus !== 'superseded' && (action === 'reuse_success' || action === 'attach_running')) {
      return { ...previous, idempotencyKey: key, resultStatus: 'current' };
    }
    return {
      id: previous?.id || `gen_${item.id}_${shot.shot_no}_${idx}`,
      shot_no: shot.shot_no,
      title: shot.title || `分镜 ${shot.shot_no}`,
      prompt: shot.prompt || '',
      status: 'PENDING' as const,
      idempotencyKey: key,
      attempt,
      resultStatus: 'current' as const,
      revision: (shot as { revision?: number }).revision || 0,
      outputReview: 'unreviewed' as const,
      outputSize: context.generationStrategy === 'grid_first' && context.gridOutputSize
        ? context.gridOutputSize : previous?.resultStatus === 'superseded' ? undefined : savedWorkshopOutputSize(previous),
    };
  });
}

export function needsGenerationSubmit(task: BatchTaskItem): boolean {
  if (task.recoveryRequired || task.resultStatus === 'superseded') return false;
  if (task.status === 'SUCCESS' && task.resultUrl) return false;
  if (task.status === 'IN_PROGRESS' && !task.recoveryRequired) return false;
  return true;
}
