import { expect, it } from 'vitest';
import { modelRequestError } from './requestError';

it('区分上游额度和频率错误，不泄漏响应内容', () => {
  const quota = modelRequestError(429, JSON.stringify({ error: { code: 'insufficient_quota', message: 'secret-token' } }));
  expect(quota.message).toContain('额度不足');
  expect(quota.message).not.toContain('secret-token');
  const rate = modelRequestError(429, JSON.stringify({ error: { type: 'rate_limit_exceeded' } }), '30');
  expect(rate.message).toContain('频率或并发');
  expect(rate.message).toContain('30 秒');
});
it('未提供明确原因时不武断判断额度不足', () => {
  expect(modelRequestError(429, '<html>unknown</html>').message).toContain('限流或额度受限');
  expect(modelRequestError(429, '{}', 'secret-value').message).not.toContain('secret-value');
});
