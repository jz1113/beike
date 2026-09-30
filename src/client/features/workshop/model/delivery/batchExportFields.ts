import { fullPromptGroupLabel } from '@shared/domain/assets/fullPromptGroupLabel';
import { getCachedAssetsSync } from '@client/shared/api/assetLibraryCache';
import type { BatchProductItem, BatchTaskItem } from '../batchTypes';
import { isDeliverableWorkshopResult } from '../generation/workshopReadiness';

export function exportPromptGroupName(item: BatchProductItem): string {
  const label = fullPromptGroupLabel(item.appliedFullPromptDisplayNumber);
  if (label !== '未编号图组') return label;
  if (!item.appliedFullPromptId) return '未绑定图组';
  const cached = getCachedAssetsSync('full_prompt').find(asset => asset.id === item.appliedFullPromptId);
  return fullPromptGroupLabel(cached?.displayNumber);
}

export function exportProductId(item: BatchProductItem): string {
  return item.itemId?.trim() || item.id;
}

export function exportGeneratedTitle(item: BatchProductItem): string {
  return item.copywriting?.title?.trim() || '';
}

export function exportFourShots(item: BatchProductItem): BatchTaskItem[] {
  const byShot = new Map<number, BatchTaskItem>();
  for (const task of item.tasks || []) {
    if (task.shot_no >= 1 && task.shot_no <= 4 && isDeliverableWorkshopResult(task)) {
      byShot.set(task.shot_no, task);
    }
  }
  return [...byShot.values()].sort((a, b) => a.shot_no - b.shot_no);
}
