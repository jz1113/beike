export type SalesImageBatchItem = {
  id: string;
  prompt: string;
  imageModel?: string;
  referenceImages?: string[];
  aspectRatio?: string;
  idempotencyKey: string;
};

export type SalesImageBatchReceipt = {
  id: string;
  taskId?: string;
  url?: string;
  error?: string;
  outcome: 'done' | 'poll' | 'failed' | 'uncertain';
};

export type SalesImageBatchClient = {
  submitBatch: (items: SalesImageBatchItem[], isAborted: () => boolean) => Promise<SalesImageBatchReceipt[]>;
  poll: (input: { taskId: string; imageModel?: string; isAborted: () => boolean }) => Promise<string>;
  lookup: (key: string, imageModel: string | undefined, isAborted: () => boolean) => Promise<SalesImageBatchReceipt>;
};
