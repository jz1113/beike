export const MODEL_OUTPUT_ATTEMPTS = 2;
export const MAX_RECOVERY_REQUESTS = 16;

/** Retry malformed model output, then split the batch to isolate stubborn rows. */
export async function reviewBatchWithRecovery<T>(options: {
  rows: T[];
  submit: (rows: T[]) => Promise<void>;
  isModelOutputError: (error: unknown) => boolean;
  onSingleRowFailure: (row: T, error: unknown) => void;
  onUnresolvedRows?: (rows: T[], error: unknown) => void;
  shouldStop: () => boolean;
  onRetry?: (rows: T[], error: unknown) => void;
}): Promise<{ attempts: number; exhausted: boolean }> {
  const { submit, isModelOutputError, onSingleRowFailure, onUnresolvedRows, shouldStop, onRetry } = options;
  let attempts = 0;
  let exhausted = false;
  const run = async (rows: T[], previousError?: unknown): Promise<void> => {
    if (shouldStop() || rows.length === 0) return;
    if (attempts >= MAX_RECOVERY_REQUESTS) {
      exhausted = true;
      onUnresolvedRows?.(rows, previousError);
      return;
    }
    for (let attempt = 0; attempt < MODEL_OUTPUT_ATTEMPTS; attempt += 1) {
      if (attempts >= MAX_RECOVERY_REQUESTS) {
        exhausted = true;
        onUnresolvedRows?.(rows, previousError);
        return;
      }
      attempts += 1;
      try {
        await submit(rows);
        return;
      } catch (error) {
        if (!isModelOutputError(error)) throw error;
        if (shouldStop()) return;
        if (attempt + 1 < MODEL_OUTPUT_ATTEMPTS) {
          onRetry?.(rows, error);
          previousError = error;
          continue;
        }
        if (rows.length === 1) {
          onSingleRowFailure(rows[0], error);
          return;
        }
        const midpoint = Math.ceil(rows.length / 2);
        await run(rows.slice(0, midpoint), error);
        await run(rows.slice(midpoint), error);
        return;
      }
    }
  };
  await run(options.rows);
  return { attempts, exhausted };
}
