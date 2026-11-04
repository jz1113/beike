export interface SalesPendingVideoTask {
  taskId: string;
  channelTaskId?: string;
  model: string;
  modelSelection: string;
  sourceKey: string;
}

/** Only an explicitly saved receipt can reconnect a video with its production inputs. */
export function parseSalesPendingVideoTask(value: unknown): SalesPendingVideoTask | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const boundedText = (key: string, max: number): string => {
    const value = raw[key];
    return typeof value === 'string' && value.length <= max ? value.trim() : '';
  };
  const taskId = boundedText('taskId', 500);
  const model = boundedText('model', 200);
  const modelSelection = boundedText('modelSelection', 200);
  const sourceKey = boundedText('sourceKey', 1_000_000);
  const channelTaskId = boundedText('channelTaskId', 500);
  return taskId && model && modelSelection && sourceKey ? { taskId, model, modelSelection, sourceKey, ...(channelTaskId ? { channelTaskId } : {}) } : null;
}
