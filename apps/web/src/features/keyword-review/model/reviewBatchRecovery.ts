export const MODEL_OUTPUT_ATTEMPTS = 2;

/** Retry one malformed batch, then retry only the rows the server could not repair. */
export async function reviewBatchWithRecovery<T extends { id: string }>(options: {
  rows: T[];
  submit: (rows: T[]) => Promise<string[]>;
  isModelOutputError: (error: unknown) => boolean;
  onSingleRowFailure: (row: T, error: unknown) => void;
  onUnresolvedRows?: (rows: T[], error: unknown) => void;
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
        failed.forEach((row) => onSingleRowFailure(row, previousError || new Error('模型结果无法修复')));
        return { attempts, exhausted: false };
      }
      onRetry?.(failed, previousError || new Error('部分行结果无法修复'));
      pending = failed;
    } catch (error) {
      if (!isModelOutputError(error)) throw error;
      previousError = error;
      if (shouldStop()) return { attempts, exhausted };
      if (attempt + 1 >= MODEL_OUTPUT_ATTEMPTS) {
        exhausted = pending.length > 1;
        if (pending.length === 1) onSingleRowFailure(pending[0], error);
        else onUnresolvedRows?.(pending, error);
        return { attempts, exhausted };
      }
      onRetry?.(pending, error);
    }
  }
  return { attempts, exhausted };
}
