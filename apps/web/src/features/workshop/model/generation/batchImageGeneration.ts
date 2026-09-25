import { waitWhilePaused } from '@/shared/api/generationAbort';

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
