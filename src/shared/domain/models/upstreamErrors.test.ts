import { describe, expect, it } from 'vitest';
import { formatUserError } from './upstreamErrors';

describe('formatUserError', () => {
  it('turns an upstream deadline into a readable image timeout', () => {
    expect(formatUserError('context deadline exceeded')).toBe('上游生图超时');
    expect(formatUserError('提交响应未确认：context deadline exceeded。请先在上游任务记录核实是否已创建任务，避免重复生成'))
      .toBe('提交响应未确认：上游生图超时。请先在上游任务记录核实是否已创建任务，避免重复生成');
  });
});
