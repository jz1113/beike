import type { KeywordReviewMode } from '@shared/contracts/generate';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';
import type { KeywordReviewSettings } from './keywordReviewSettings';
import { createReviewBatchSubmit } from './reviewBatchSubmit';
import { reviewBatchWithRecovery } from './reviewBatchRecovery';
import { ReviewPacer } from './reviewPacer';
import type { ReviewRequestError } from './reviewRequest';

type SubmitOptions = Parameters<typeof createReviewBatchSubmit>[0];
type Checkpoints = Pick<SubmitOptions, 'onDispatch' | 'onCancelled' | 'onSuccess' | 'onRequestFailure' | 'onUsage'>;

export async function runKeywordReviewBatches(options: Checkpoints & {
  queue: KeywordReviewRecord[];
  candidates: number;
  mode: 'trial' | 'all';
  settings: KeywordReviewSettings;
  model: { model: string; provider: 'deepseek' | 'gateway'; label: string };
  baseUrl: string;
  apiKey: string;
  reviewMode: KeywordReviewMode;
  rulesVersion: number;
  signal: AbortSignal;
  shouldStop: () => boolean;
  requestStop: () => void;
  indices: Map<string, number>;
  versions: Map<number, number>;
  onWaiting: (ids: string[]) => void;
  markFailed: (ids: string[], message: string, uncertain?: boolean) => Promise<void>;
  notice: (message: string) => void;
  refreshBalance: (force?: boolean) => void;
}): Promise<string> {
  const { queue, mode, settings, rulesVersion } = options;
  const pacer = new ReviewPacer(settings.maxConcurrency);
  let nextIndex = 0;
  let completed = 0;
  let failed = 0;
  let uncertain = 0;
  let rateRetries = 0;
  let exhaustedBatches = 0;
  let infrastructureFailures = 0;
  let fatalError: Error | null = null;
  const worker = async () => {
    while (!options.shouldStop() && nextIndex < queue.length) {
      const index = nextIndex;
      nextIndex += settings.batchSize;
      const batch = queue.slice(index, index + settings.batchSize);
      const ids = batch.map((record) => record.id);
      const settled = new Set<string>();
      const markFailed = async (values: string[], message: string, submissionUncertain = false) => {
        const fresh = values.filter((id) => !settled.has(id));
        fresh.forEach((id) => settled.add(id));
        failed += fresh.length;
        if (submissionUncertain) uncertain += fresh.length;
        await options.markFailed(fresh, message, submissionUncertain);
      };
      options.notice(mode === 'trial' ? `按规则 v${rulesVersion} 正在试跑 ${batch.length} 条…`
        : `按规则 v${rulesVersion} 并行审核中，本轮还剩 ${queue.length - completed - failed} 条`);
      options.onWaiting(ids);
      const submit = createReviewBatchSubmit({
        ...options, model: options.model.model, provider: options.model.provider,
        lookup: false, lookupBudget: 0, pacer,
        onSuccess: async (chunk, results, lookedUp, usage, lookupUsage, submission) => {
          chunk.forEach((record) => settled.add(record.id));
          completed += chunk.length;
          await options.onSuccess(chunk, results, lookedUp, usage, lookupUsage, submission);
          options.refreshBalance();
          infrastructureFailures = 0;
        },
        onRateLimit: (concurrency) => {
          rateRetries += 1;
          options.notice(`${options.model.label} 限流，已降至 ${concurrency} 个并行请求并等待重试…`);
        },
        onFailure: () => options.refreshBalance(true),
      });
      try {
        const recovery = await reviewBatchWithRecovery({
          rows: batch, submit, shouldStop: options.shouldStop,
          isModelOutputError: (error) => (error as ReviewRequestError).modelOutputInvalid === true,
          onRetry: (rows) => options.notice(`模型格式异常，正在自动重试 ${rows.length} 条…`),
          onSingleRowFailure: (record, error) => markFailed([record.id], error instanceof Error ? error.message : '模型结果异常'),
          onUnresolvedRows: (rows) => markFailed(rows.map((record) => record.id), '模型格式异常，本批自动重试已达费用保护上限'),
        });
        exhaustedBatches = recovery.exhausted ? exhaustedBatches + 1 : 0;
        if (exhaustedBatches >= 2) {
          fatalError = new Error('连续两批模型格式异常达到自动重试费用保护上限');
          options.requestStop();
        }
      } catch (error) {
        const failure = error instanceof Error ? error as ReviewRequestError : new Error('审核失败') as ReviewRequestError;
        await markFailed(ids, failure.message, failure.outcomeUncertain === true);
        if (failure.fatalConfig || failure.fatalLocal) {
          fatalError = failure;
          options.requestStop();
          break;
        }
        infrastructureFailures = failure.infrastructureFailure ? infrastructureFailures + 1 : 0;
        if (infrastructureFailures >= 6) {
          fatalError = new Error('审核服务连续 6 批不可用，已暂停提交以控制费用');
          options.requestStop();
          break;
        }
      }
    }
  };
  const workers = Math.min(mode === 'trial' ? 1 : settings.maxConcurrency, Math.ceil(queue.length / settings.batchSize));
  await Promise.allSettled(Array.from({ length: workers }, async () => {
    try { await worker(); }
    catch (error) { fatalError = error instanceof Error ? error : new Error('审核批次处理失败'); options.requestStop(); }
  }));
  const failedNote = failed ? `、失败 ${failed} 条` : '';
  const uncertainNote = uncertain ? `（其中 ${uncertain} 条提交待核对，暂不重新收费）` : '';
  if (fatalError) return `${(fatalError as Error).message}。本次完成 ${completed} 条${failedNote}${uncertainNote}；可导出当前进度。`;
  if (options.shouldStop()) return `已停止，本次完成 ${completed} 条${failedNote}${uncertainNote}，可继续未完成记录`;
  if (mode === 'trial') return `本批试跑完成 ${completed} 条${failedNote}${uncertainNote}${options.candidates - completed - failed > 0 ? `，还剩 ${options.candidates - completed - failed} 条未审核` : ''}`;
  return `批量审核已处理到最后一个词：完成 ${completed} 条${failedNote}${uncertainNote}${rateRetries ? `，限流后重试 ${rateRetries} 次` : ''}`;
}
