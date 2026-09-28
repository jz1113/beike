import type { BatchProductItem, BatchTaskItem } from '../batchTypes';
import { isUsableWorkshopResult } from './workshopReadiness';

/** Only one current, durable, explicitly accepted result may represent each shot. */
export function reviewedFourShotGroup(item: BatchProductItem, groupIndex: number): BatchTaskItem[] | null {
  const current = (item.tasks || []).filter((task) => task.resultStatus !== 'superseded');
  const shots = Array.from({ length: 4 }, (_, index) => {
    const matches = current.filter((task) => task.shot_no === groupIndex * 4 + index + 1);
    return matches.length === 1 ? matches[0] : null;
  });
  return shots.every((task) => task && isUsableWorkshopResult(task) && task.outputReview === 'accepted')
    ? shots as BatchTaskItem[] : null;
}

export function reviewedGroupSignature(tasks: BatchTaskItem[] | null): string {
  return tasks?.map((task) => `${task.id}:${task.resultUrl}`).join('|') || '';
}
