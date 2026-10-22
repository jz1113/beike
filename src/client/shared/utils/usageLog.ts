export interface UsageLogItem {
  id: string;
  timestamp: number; // Date.now()
  taskId?: string;
  localTaskId?: string;
  modelId: string;
  modelName: string;
  provider: string;
  type: 'image' | 'video' | 'chat' | 'vision' | 'distill' | 'audio';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  mediaCount?: number;
  costUsd: number;  // 算力消耗 (点)
  costRmb: number;  // 折算人民币金额 (¥) = costUsd * 1.2
  success: boolean;
  cached?: boolean;
}
