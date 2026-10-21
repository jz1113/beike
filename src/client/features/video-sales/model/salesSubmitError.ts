export interface SalesVideoLookup {
  outcome: 'done' | 'poll' | 'pending' | 'failed' | 'missing';
  taskId?: string;
  url?: string;
  error?: string;
}

export class SalesSubmitUncertainError extends Error {
  constructor(message = '视频提交结果未确认，请先核对是否已经生成，不要立刻重复提交') {
    super(message);
    this.name = 'SalesSubmitUncertainError';
  }
}
