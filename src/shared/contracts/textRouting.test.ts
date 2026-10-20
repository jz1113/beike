import { describe, expect, it } from 'vitest';
import { TextProtocolSchema } from './textRouting';
import { turnStartBodySchema } from './assistant';
import { analyzeBodySchema } from './catalog';
import { HeadlineTitleRequestSchema, KeywordReviewRequestSchema } from './generate';
import { videoSalesAnalyzeBodySchema } from './videoSales';
import { deconstructJobSubmitSchema } from './deconstructJobs';

describe('shared text routing DTOs', () => {
  it('retains routing preferences without replacing Responses', () => {
    const base = { textProtocol: 'gemini', apiFormat: 'openai-responses' };
    expect(turnStartBodySchema.parse({ ...base, messages: [{ role: 'user', content: 'hello' }] })).toMatchObject(base);
    expect(analyzeBodySchema.parse(base)).toMatchObject(base);
    expect(HeadlineTitleRequestSchema.parse({ textProtocol: 'anthropic', imageUrls: ['https://example.test/a.png'] }).textProtocol).toBe('anthropic');
    expect(KeywordReviewRequestSchema.parse({ textProtocol: 'openai', rows: [{ id: '1', query: 'query' }] }).textProtocol).toBe('openai');
    expect(videoSalesAnalyzeBodySchema.parse({ textProtocol: 'auto', imageUrls: ['https://example.test/a.png'] }).textProtocol).toBe('auto');
    expect(deconstructJobSubmitSchema.parse({ jobId: 'job', items: [{ id: '1', name: 'a', images: ['url'] }], overrides: { ...base, allowInsecureHttp: true } }).overrides).toMatchObject({ ...base, allowInsecureHttp: true });
  });
  it('rejects unsupported protocol names', () => {
    expect(TextProtocolSchema.safeParse('azure').success).toBe(false);
  });
});
