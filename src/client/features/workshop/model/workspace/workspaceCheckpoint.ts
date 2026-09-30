import type { WorkshopSnapshot } from '@shared/contracts/workshopWorkspace';
import { serializeWorkspaceSnapshot } from './workspaceSave';

function executionInput(item: WorkshopSnapshot['items'][number]): string {
  return JSON.stringify({
    title: item.title, prompts: item.prompts, selectedProductImages: item.selectedProductImages,
    coverImage: item.coverImage, gridPrompt: item.gridPrompt, lookParts: item.lookParts,
    productRole: item.productRole, productFingerprint: item.productFingerprint,
  });
}

/** Progress may advance, but the saved command's inputs and attempts must survive. */
export function containsWorkspaceCommand(current: WorkshopSnapshot, expected: WorkshopSnapshot): boolean {
  if (JSON.stringify(current.settings) !== JSON.stringify(expected.settings)) return false;
  if (current.pipeline.storyboardRevision !== expected.pipeline.storyboardRevision) return false;
  return expected.items.every(item => {
    const live = current.items.find(entry => entry.id === item.id);
    if (!live || executionInput(live) !== executionInput(item)) return false;
    return item.tasks.every(task => live.tasks.some(entry => entry.id === task.id
      && entry.idempotencyKey === task.idempotencyKey && entry.attempt === task.attempt
      && (!task.upstreamTaskId || entry.upstreamTaskId === task.upstreamTaskId)
      && (!task.gridTaskKey || entry.gridTaskKey === task.gridTaskKey)
      && (!task.outputSize || entry.outputSize === task.outputSize)
      && (!task.generationSize || entry.generationSize === task.generationSize)));
  });
}

export function createWorkspaceCheckpoint(options: {
  batchId: string;
  currentBatchId: () => string | undefined;
  read: () => WorkshopSnapshot;
  save: (expectedJson: string) => Promise<boolean>;
}): () => Promise<void> {
  let expected = options.read();
  return async () => {
    for (let pass = 0; pass < 8; pass++) {
      const current = options.read();
      if (options.currentBatchId() !== options.batchId || !containsWorkspaceCommand(current, expected)) {
        throw new Error('批次、输入或生成配置已变化，未提交新的生图任务，请检查后重新开始');
      }
      const json = serializeWorkspaceSnapshot(current);
      const confirmed = await options.save(json);
      const after = options.read();
      if (confirmed && serializeWorkspaceSnapshot(after) === json && options.currentBatchId() === options.batchId) {
        expected = after;
        return;
      }
      if (serializeWorkspaceSnapshot(after) === json) break;
    }
    throw new Error('当前批次尚未确认保存，已阻止继续提交；请处理保存错误后重试');
  };
}
