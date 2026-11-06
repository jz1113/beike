export interface SalesPendingVideoTask {
  taskId: string;
  channelTaskId?: string;
  recordId?: string;
  usageOperationId?: string;
  model: string;
  modelSelection: string;
  sourceKey: string;
}

export interface SalesPendingMixTask {
  taskId: string;
  sourceKey: string;
}

export function parseSalesPendingMixTask(value: unknown): SalesPendingMixTask | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { taskId, sourceKey } = value as Record<string, unknown>;
  return typeof taskId === 'string' && /^(sales_media_[\w-]{1,480}|sales_voice_op_[\w-]{1,256})$/.test(taskId)
    && typeof sourceKey === 'string' && sourceKey.trim() && sourceKey.length <= 2_000_000
    ? { taskId, sourceKey } : null;
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
  const recordId = boundedText('recordId', 500);
  const usageOperationId = boundedText('usageOperationId', 500);
  const channelTaskId = boundedText('channelTaskId', 500);
  return taskId && model && modelSelection && sourceKey ? { taskId, model, modelSelection, sourceKey, ...(recordId ? { recordId } : {}), ...(usageOperationId ? { usageOperationId } : {}), ...(channelTaskId ? { channelTaskId } : {}) } : null;
}
