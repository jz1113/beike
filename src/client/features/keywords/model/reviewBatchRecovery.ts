export const MODEL_OUTPUT_ATTEMPTS = 2;

/** Retry one malformed batch, then retry only the rows the server could not repair. */
export async function reviewBatchWithRecovery<T extends { id: string }>(options: {
  rows: T[];
  submit: (rows: T[]) => Promise<string[]>;
  isModelOutputError: (error: unknown) => boolean;
  onSingleRowFailure: (row: T, error: unknown) => void | Promise<void>;
  onUnresolvedRows?: (rows: T[], error: unknown) => void | Promise<void>;
  shouldStop: () => boolean;
  onRetry?: (rows: T[], error: unknown) => void;
}): Promise<{ attempts: number; exhausted: boolean }> {
  const { submit, isModelOutputError, onSingleRowFailure, onUnresolvedRows, shouldStop, onRetry } = options;
  let pending = options.rows;
  let attempts = 0;
  let exhausted = false;
  let previousError: unknown;
  for (let attempt = 0; attempt < MODEL_OUTPUT_ATTEMPTS && pending.length > 0; attempt += 1) {
    if (shouldStop()) return { attempts, exhausted };
    attempts += 1;
    try {
      const failedIds = new Set(await submit(pending));
      if (failedIds.size === 0) return { attempts, exhausted: false };
      const failed = pending.filter((row) => failedIds.has(row.id));
      if (attempt + 1 >= MODEL_OUTPUT_ATTEMPTS) {
        for (const row of failed) await onSingleRowFailure(row, previousError || new Error('模型结果无法修复'));
        return { attempts, exhausted: failed.length > 1 && failed.length === pending.length };
      }
      onRetry?.(failed, previousError || new Error('部分行结果无法修复'));
      pending = failed;
    } catch (error) {
      if (!isModelOutputError(error)) throw error;
      previousError = error;
      if (shouldStop()) return { attempts, exhausted };
      if (attempt + 1 >= MODEL_OUTPUT_ATTEMPTS) {
        exhausted = pending.length > 1;
        if (pending.length === 1) await onSingleRowFailure(pending[0], error);
        else await onUnresolvedRows?.(pending, error);
        return { attempts, exhausted };
      }
      if (pending.length > 10) {
        onRetry?.(pending, error);
        return retrySplitBatch(pending, {
          submit, isModelOutputError, onSingleRowFailure, onUnresolvedRows, shouldStop, attempts, previousError: error,
        });
      }
      onRetry?.(pending, error);
    }
  }
  return { attempts, exhausted };
}

async function retrySplitBatch<T extends { id: string }>(
  pending: T[],
  options: {
    submit: (rows: T[]) => Promise<string[]>;
    isModelOutputError: (error: unknown) => boolean;
    onSingleRowFailure: (row: T, error: unknown) => void | Promise<void>;
    onUnresolvedRows?: (rows: T[], error: unknown) => void | Promise<void>;
    shouldStop: () => boolean;
    attempts: number;
    previousError: unknown;
  },
): Promise<{ attempts: number; exhausted: boolean }> {
  const mid = Math.ceil(pending.length / 2);
  let attempts = options.attempts;
  let recovered = false;
  let unresolved = false;
  for (const half of [pending.slice(0, mid), pending.slice(mid)]) {
    if (half.length === 0 || options.shouldStop()) return { attempts, exhausted: unresolved && !recovered };
    attempts += 1;
    try {
      const failedIds = new Set(await options.submit(half));
      const failed = half.filter((row) => failedIds.has(row.id));
      if (failed.length < half.length) recovered = true;
      for (const row of failed) await options.onSingleRowFailure(row, options.previousError);
    } catch (error) {
      if (!options.isModelOutputError(error)) throw error;
      if (half.length === 1) await options.onSingleRowFailure(half[0], error);
      else {
        unresolved = true;
        await options.onUnresolvedRows?.(half, error);
      }
    }
  }
  return { attempts, exhausted: unresolved && !recovered };
}
