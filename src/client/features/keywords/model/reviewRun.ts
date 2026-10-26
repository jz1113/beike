import type { KeywordReviewMode } from '@shared/contracts/generate';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import type { ResolvedTextProtocol } from '@shared/domain/models/textProtocol';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';
import type { KeywordReviewSettings } from './keywordReviewSettings';
import { createReviewBatchSubmit } from './reviewBatchSubmit';
import { reviewBatchWithRecovery } from './reviewBatchRecovery';
import { ReviewPacer } from './reviewPacer';
import type { ReviewRequestError } from './reviewRequest';

type SubmitOptions = Parameters<typeof createReviewBatchSubmit>[0];
type Checkpoints = Pick<SubmitOptions, 'onDispatch' | 'onCancelled' | 'onSuccess' | 'onRequestFailure' | 'onUsage'>;

/** First try plus two resubmits per pass; bulk runs revisit remaining failures. */
const BATCH_ATTEMPTS = 3;

function halvedBatchLimit(rowCount: number): number {
  return Math.max(10, Math.floor(rowCount / 2));
}

export async function runKeywordReviewBatches(options: Checkpoints & {
  queue: KeywordReviewRecord[];
  candidates: number;
  mode: 'trial' | 'all';
  settings: KeywordReviewSettings;
  model: { model: string; provider: 'deepseek' | 'gateway'; label: string; textProtocol?: ResolvedTextProtocol; reasoningEffort?: ReasoningEffort };
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
  pacer?: ReviewPacer;
  request?: SubmitOptions['request'];
}): Promise<string> {
  const { mode, settings, rulesVersion } = options;
  let queue = options.queue;
  const recordsById = new Map(queue.map((record) => [record.id, record]));
  const completedIds = new Set<string>();
  const failures = new Map<string, { record: KeywordReviewRecord; uncertain: boolean }>();
  const pacer = options.pacer ?? new ReviewPacer(settings.maxConcurrency);
  let batchLimit = settings.batchSize;
  const shrinkBatchLimit = (rowCount: number): boolean => {
    const next = halvedBatchLimit(rowCount);
    if (next >= batchLimit) return false;
    batchLimit = next;
    return true;
  };
  let nextIndex = 0;
  let completed = 0;
  let rateRetries = 0;
  let retryRound = 0;
  let fatalError: Error | null = null;
  const bumpVersion = (rows: KeywordReviewRecord[]) => {
    for (const record of rows) {
      const index = options.indices.get(record.id);
      if (index !== undefined) options.versions.set(index, (options.versions.get(index) ?? 0) + 1);
    }
  };
  const worker = async () => {
    const submitBatch = async (batch: KeywordReviewRecord[], attempt = 0): Promise<void> => {
      batch = batch.filter((record) => !completedIds.has(record.id));
      if (batch.length === 0 || options.shouldStop()) return;
      const ids = batch.map((record) => record.id);
      const settled = new Set<string>();
      const markFailed = async (values: string[], message: string, submissionUncertain = false) => {
        const fresh = values.filter((id) => !settled.has(id) && !completedIds.has(id));
        fresh.forEach((id) => settled.add(id));
        for (const id of fresh) failures.set(id, { record: recordsById.get(id)!, uncertain: submissionUncertain });
        await options.markFailed(fresh, message, submissionUncertain);
      };
      const submit = createReviewBatchSubmit({
        ...options, model: options.model.model, provider: options.model.provider, textProtocol: options.model.textProtocol, reasoningEffort: options.model.reasoningEffort,
        lookup: false, lookupBudget: 0, pacer,
        onSuccess: async (chunk, results, lookedUp, usage, lookupUsage, submission) => {
          for (const record of chunk) {
            settled.add(record.id);
            if (!completedIds.has(record.id)) completed += 1;
            completedIds.add(record.id);
            failures.delete(record.id);
          }
          await options.onSuccess(chunk, results, lookedUp, usage, lookupUsage, submission);
          options.refreshBalance();
        },
        onRateLimit: (concurrency, reason) => {
          rateRetries += 1;
          const why = reason === 'gateway' ? '网关暂时失败' : '限流';
          options.notice(`${options.model.label} ${why}，已降至 ${concurrency} 个并行请求，正在自动重试…`);
        },
        onFailure: () => options.refreshBalance(true),
      });
      const resubmit = async (rows: KeywordReviewRecord[], failure: ReviewRequestError) => {
        if (options.shouldStop() || failure.outcomeUncertain || failure.fatalConfig || failure.fatalLocal || rows.length === 0 || attempt + 1 >= BATCH_ATTEMPTS) return false;
        options.notice(`${options.model.label} 本批未完成，正在自动重试（${attempt + 2}/${BATCH_ATTEMPTS}）…`);
        await submitBatch(rows, attempt + 1);
        return true;
      };
      try {
        const unresolved: KeywordReviewRecord[] = [];
        let formatMessage = '模型格式异常，自动重试后仍未通过';
        const remember = (rows: KeywordReviewRecord[], error: unknown) => {
          if (error instanceof Error && error.message) formatMessage = error.message;
          for (const record of rows) {
            if (!unresolved.some((item) => item.id === record.id) && !settled.has(record.id)) unresolved.push(record);
          }
        };
        await reviewBatchWithRecovery({
          rows: batch, submit, shouldStop: options.shouldStop,
          isModelOutputError: (error) => (error as ReviewRequestError).modelOutputInvalid === true,
          onRetry: (rows) => options.notice(`模型格式异常，正在自动重试 ${rows.length} 条…`),
          onSingleRowFailure: (record, error) => remember([record], error),
          onUnresolvedRows: (rows, error) => remember(rows, error),
        });
        if (unresolved.length > 0) {
          const formatError = Object.assign(new Error(formatMessage), { modelOutputInvalid: true }) as ReviewRequestError;
          if (!await resubmit(unresolved, formatError)) await markFailed(unresolved.map((record) => record.id), formatMessage);
        }
      } catch (error) {
        const failure = error instanceof Error ? error as ReviewRequestError : new Error('审核失败') as ReviewRequestError;
        if (failure.gatewayTimeout === true && !failure.outcomeUncertain && batch.length > 10 && !options.shouldStop()) {
          const mid = Math.ceil(batch.length / 2);
          const shrunk = shrinkBatchLimit(batch.length);
          const batchNote = shrunk ? `，后续改为每批不超过 ${batchLimit} 条` : '';
          options.notice(`${options.model.label} 单次响应超时，网关切断了这次响应，已把 ${batch.length} 条拆成两批继续${batchNote}，并行降至 ${pacer.concurrency} 路…`);
          await submitBatch(batch.slice(0, mid));
          const rest = batch.slice(mid);
          if (!options.shouldStop()) await submitBatch(rest);
          else await markFailed(rest.map((record) => record.id), failure.message);
          return;
        }
        if (failure.fatalConfig || failure.fatalLocal) {
          await markFailed(ids, failure.message, failure.outcomeUncertain === true);
          fatalError = failure;
          options.requestStop();
          return;
        }
        if (await resubmit(batch, failure)) return;
        await markFailed(ids, failure.message, failure.outcomeUncertain === true);
      }
    };
    while (!options.shouldStop() && nextIndex < queue.length) {
      const index = nextIndex;
      const size = Math.min(settings.batchSize, batchLimit);
      nextIndex += size;
      const batch = queue.slice(index, index + size);
      options.notice(mode === 'trial' ? `按规则 v${rulesVersion} 正在试跑 ${batch.length} 条…`
        : `按规则 v${rulesVersion} ${retryRound ? `自动重试第 ${retryRound} 轮` : '并行审核中'}，已完成 ${completed}/${options.queue.length} 条`);
      options.onWaiting(batch.map((record) => record.id));
      await submitBatch(batch);
    }
  };
  while (queue.length > 0 && !options.shouldStop()) {
    nextIndex = 0;
    const workers = Math.min(mode === 'trial' ? 1 : settings.maxConcurrency, Math.ceil(queue.length / settings.batchSize));
    await Promise.allSettled(Array.from({ length: workers }, async () => {
      try { await worker(); }
      catch (error) { fatalError = error instanceof Error ? error : new Error('审核批次处理失败'); options.requestStop(); }
    }));
    if (mode === 'trial' || fatalError || options.shouldStop()) break;
    queue = [...failures.values()].filter((failure) => !failure.uncertain).map((failure) => failure.record);
    if (queue.length === 0) break;
    retryRound += 1;
    options.notice(`已完成 ${completed}/${options.queue.length} 条，剩余 ${queue.length} 条失败记录将在等待后自动重试（第 ${retryRound} 轮），无需手动点击重试。`);
    if (!await pacer.waitToRetry(retryRound, options.shouldStop)) break;
    bumpVersion(queue);
  }
  const failed = failures.size;
  const uncertain = [...failures.values()].filter((failure) => failure.uncertain).length;
  const failedNote = failed ? `、失败 ${failed} 条` : '';
  const uncertainNote = uncertain ? `（其中 ${uncertain} 条提交待核对，暂不重新收费）` : '';
  if (fatalError) return `${(fatalError as Error).message}。本次完成 ${completed} 条${failedNote}${uncertainNote}；可导出当前进度。`;
  if (options.shouldStop()) return `已停止，本次完成 ${completed} 条${failedNote}${uncertainNote}，可继续未完成记录`;
  if (mode === 'trial') return `本批试跑完成 ${completed} 条${failedNote}${uncertainNote}${options.candidates - completed - failed > 0 ? `，还剩 ${options.candidates - completed - failed} 条未审核` : ''}`;
  return `批量审核已处理到最后一个词：完成 ${completed} 条${failedNote}${uncertainNote}${rateRetries ? `，自动重试 ${rateRetries} 次` : ''}`;
}
