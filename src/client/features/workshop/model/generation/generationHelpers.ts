import { parseOutputDimensions } from '@shared/domain/media/outputDimensions';
import { GPT_IMAGE_GATEWAY_SAFE_SIZES } from '@shared/domain/models/model-adapters/image/gptImageSafeSizes';
import type { BatchProductItem, BatchTaskItem, GenerationStrategy } from '../batchTypes';
import { isUsableWorkshopResult } from './workshopReadiness';
import { waitWhilePaused } from '@client/shared/api/generation/generationAbort';
import type { ShotPrompt } from '@shared/domain/prompts/vision';


/** Pick the supported canvas closest to an arbitrary delivered aspect to minimize cropping. */
export function closestWorkshopOutputAspect(size: string): string {
  const dimensions = parseOutputDimensions(size);
  if (!dimensions) return '3:4';
  const target = dimensions.width / dimensions.height;
  return Object.keys(GPT_IMAGE_GATEWAY_SAFE_SIZES).filter(aspect => aspect !== 'smart').reduce((best, aspect) => {
    const distance = (value: string) => { const [width, height] = value.split(':').map(Number); return Math.abs(Math.log(target / (width / height))); };
    return distance(aspect) < distance(best) ? aspect : best;
  }, '3:4');
}

/** A single-shot redraw must not double the dimensions of a grid-derived shot. */
export function needsGenerationSubmit(task: BatchTaskItem): boolean {
  if (task.recoveryRequired || task.resultStatus === 'superseded') return false;
  if (task.status === 'SUCCESS' && task.resultUrl) return false;
  if (task.status === 'IN_PROGRESS' && !task.recoveryRequired) return false;
  return true;
}

export function savedWorkshopOutputSize(task?: { outputSize?: string; gridSize?: string }): string | undefined {
  if (task?.outputSize) return task.outputSize;
  const match = /^(\d+)x(\d+)$/.exec(task?.gridSize || '');
  if (!match || Number(match[1]) < 2 || Number(match[2]) < 2) return undefined;
  return `${Math.floor(Number(match[1]) / 2)}x${Math.floor(Number(match[2]) / 2)}`;
}


/** 已失败、或显式恢复时，优先用任务上的原图，再退回商品级四宫格原图。 */
export function resolveGridRecoverySource(input: {
  recoveryOnly: boolean;
  masterGridUrl?: string;
  tasks: Pick<BatchTaskItem, 'shot_no' | 'status' | 'gridSourceUrl'>[];
  pendingShotNos: number[];
}): string | undefined {
  const pending = new Set(input.pendingShotNos);
  const stored = input.tasks.find((task) => pending.has(task.shot_no) && task.gridSourceUrl)?.gridSourceUrl;
  if (stored) return stored;
  const failed = input.tasks.some((task) => pending.has(task.shot_no) && task.status === 'FAILURE');
  if ((input.recoveryOnly || failed) && input.masterGridUrl) return input.masterGridUrl;
  return undefined;
}


/** Only one current, durable, explicitly accepted result may represent each shot. */
export function reviewedFourShotGroup(item: BatchProductItem, groupIndex: number): BatchTaskItem[] | null {
  const current = (item.tasks || []).filter((task) => task.resultStatus !== 'superseded');
  const shots = Array.from({ length: 4 }, (_, index) => {
    const matches = current.filter((task) => task.shot_no === groupIndex * 4 + index + 1);
    return matches.length === 1 ? matches[0] : null;
  });
  return shots.every((task) => task && isUsableWorkshopResult(task) && !task.temporaryUrl && task.outputReview === 'accepted')
    ? shots as BatchTaskItem[] : null;
}

export function reviewedGroupSignature(tasks: BatchTaskItem[] | null): string {
  return tasks?.map((task) => `${task.id}:${task.resultUrl}`).join('|') || '';
}


/** 并发槽位对应实际生图请求；每次完成立即补充下一任务。 */
export async function runGenerationJobs<T>(opts: {
  jobs: T[];
  concurrency: number;
  isAborted: () => boolean;
  isPaused?: () => boolean;
  execute: (job: T) => Promise<void>;
}): Promise<void> {
  let nextIndex = 0;
  const limit = Number.isFinite(opts.concurrency) ? Math.max(1, Math.floor(opts.concurrency)) : 4;
  const worker = async () => {
    while (nextIndex < opts.jobs.length && !opts.isAborted()) {
      if (opts.isPaused) await waitWhilePaused(opts.isPaused, opts.isAborted);
      if (opts.isAborted()) break;
      const job = opts.jobs[nextIndex++];
      if (job === undefined) break;
      await opts.execute(job);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, opts.jobs.length) }, () => worker()));
}


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


/** Explicit new attempt: never inherit an old upstream/grid result or approval. */
export function prepareTaskRetry(task: BatchTaskItem): BatchTaskItem {
  const attempt = (task.attempt || 0) + 1;
  const base = (task.idempotencyKey || task.id).replace(/:a\d+$/, '');
  return {
    ...task, status: 'PENDING', error: undefined, recoveryRequired: false,
    attempt, idempotencyKey: `${base}:a${attempt}`, upstreamTaskId: undefined,
    generationSize: undefined,
    gridTaskKey: undefined, gridSourceUrl: undefined, gridSize: undefined, outputSize: savedWorkshopOutputSize(task),
    resultUrl: undefined, temporaryUrl: false, outputReview: 'unreviewed', outputRating: undefined, learningContext: undefined,
    resultStatus: 'current',
  };
}

/** Only called after the user explicitly accepts possible duplicate billing. */
export function acknowledgeUncertainTasks(items: BatchProductItem[]): BatchProductItem[] {
  return items.map(item => {
    if (!item.selected || !item.tasks.some(task => task.recoveryRequired)) return item;
    return { ...item, masterGridUrl: undefined, tasks: item.tasks.map(task => task.recoveryRequired
      ? { ...task, recoveryRequired: false, gridTaskKey: undefined, gridSourceUrl: undefined,
        gridSize: undefined, outputSize: savedWorkshopOutputSize(task), generationSize: undefined, upstreamTaskId: undefined, error: '已确认放弃原结果，可手动重新生成' }
      : task) };
  });
}

export {
  compressProductImageIfNeeded,
  pollSingleTask,
  submitImageGenTask,
} from '@client/shared/api/generation/generationApi';
export type { SubmitImageGenTaskDeps } from '@client/shared/api/generation/generationApi';
