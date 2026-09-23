export const MODEL_OUTPUT_ATTEMPTS = 2;

/** Retry malformed model output, then split the batch to isolate stubborn rows. */
export async function reviewBatchWithRecovery<T>(options: {
  rows: T[];
  submit: (rows: T[]) => Promise<void>;
  isModelOutputError: (error: unknown) => boolean;
  onSingleRowFailure: (row: T, error: unknown) => void;
  shouldStop: () => boolean;
  onRetry?: (rows: T[], error: unknown) => void;
}): Promise<void> {
  const { rows, submit, isModelOutputError, onSingleRowFailure, shouldStop, onRetry } = options;
  if (shouldStop() || rows.length === 0) return;
  for (let attempt = 0; attempt < MODEL_OUTPUT_ATTEMPTS; attempt += 1) {
    try {
      await submit(rows);
      return;
    } catch (error) {
      if (!isModelOutputError(error)) throw error;
      if (shouldStop()) return;
      if (attempt + 1 < MODEL_OUTPUT_ATTEMPTS) {
        onRetry?.(rows, error);
        continue;
      }
      if (rows.length === 1) {
        onSingleRowFailure(rows[0], error);
        return;
      }
      const midpoint = Math.ceil(rows.length / 2);
      await reviewBatchWithRecovery({ ...options, rows: rows.slice(0, midpoint) });
      await reviewBatchWithRecovery({ ...options, rows: rows.slice(midpoint) });
      return;
    }
  }
}
