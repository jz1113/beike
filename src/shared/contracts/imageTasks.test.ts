import { describe, expect, it } from 'vitest';
import { turnStartBodySchema } from './assistant';
import { AssetTasksListResponseSchema, HeadlineTitleRequestSchema, TextProtocolSchema } from './generate';

describe('asset task receipts', () => {
  it('validates mixed completed and unknown submissions without dropping recovery fields', () => {
    const response = {
      success: true,
      tasks: [
        { id: 'done', prompt: '商品图', status: 'SUCCESS', resultUrl: '/storage/result.png' },
        { id: 'unknown', prompt: '商品图', taskId: 'pending-original', status: 'SUBMISSION_UNKNOWN', mediaType: 'image', failReason: '提交结果待核实', idempotencyKey: 'original-key' },
      ],
      total: 2,
    };
    expect(AssetTasksListResponseSchema.parse(response)).toEqual(response);
  });

  it('keeps query transport failures separate from durable task states', () => {
    expect(AssetTasksListResponseSchema.safeParse({
      tasks: [{ id: 'receipt', prompt: '商品图', status: 'QUERY_FAILED' }],
    }).success).toBe(false);
  });
});

describe('shared text routing DTOs', () => {
  it('retains routing preferences without replacing Responses', () => {
    const base = { textProtocol: 'gemini', apiFormat: 'openai-responses' };
    expect(turnStartBodySchema.parse({ ...base, messages: [{ role: 'user', content: 'hello' }] })).toMatchObject(base);
    expect(HeadlineTitleRequestSchema.parse({ textProtocol: 'anthropic', imageUrls: ['https://example.test/a.png'] }).textProtocol).toBe('anthropic');
  });
  it('rejects unsupported protocol names', () => {
    expect(TextProtocolSchema.safeParse('azure').success).toBe(false);
  });
});
