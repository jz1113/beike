import type { ShotPrompt } from '@beike/domain/vision';
import type { BatchProductItem, GenerationStrategy } from '../batchTypes';
import { needsGenerationSubmit } from './mergeGenerationTasks';

export interface BatchGenerationJob {
  item: BatchProductItem;
  shots: ShotPrompt[];
}

/** 单镜按轮次跨商品分配，四宫格保持一次请求一个完整图组。 */
export function buildBatchGenerationJobs(items: BatchProductItem[], strategy: GenerationStrategy): BatchGenerationJob[] {
  const groups = items.map((item) => ({ item, shots: (item.prompts || []).filter((shot) => {
    if (shot.selected === false) return false;
    const task = item.tasks.find((entry) => entry.shot_no === shot.shot_no);
    return !task || needsGenerationSubmit(task);
  }) })).filter((group) => group.shots.length > 0);
  if (strategy === 'grid_first') return groups;
  const jobs: BatchGenerationJob[] = [];
  const maxShots = groups.reduce((max, group) => Math.max(max, group.shots.length), 0);
  for (let index = 0; index < maxShots; index++) {
    for (const group of groups) {
      if (group.shots[index]) jobs.push({ item: group.item, shots: [group.shots[index]] });
    }
  }
  return jobs;
}
