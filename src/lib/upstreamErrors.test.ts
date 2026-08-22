import { describe, expect, it } from 'vitest';
import { formatUserError, hasChineseText, humanizeUpstreamError } from './upstreamErrors';

describe('formatUserError', () => {
  it('passes through Chinese messages', () => {
    expect(formatUserError(new Error('视觉模型响应超时，请稍后重试'))).toBe(
      '视觉模型响应超时，请稍后重试',
    );
  });

  it('maps AbortError to Chinese timeout', () => {
    const err = new DOMException('This operation was aborted.', 'AbortError');
    expect(formatUserError(err)).toBe('请求超时，请稍后重试');
  });

  it('maps failed to fetch to Chinese network error', () => {
    expect(formatUserError(new Error('Failed to fetch'))).toBe(
      '网络连接失败，请检查网络或 API 地址',
    );
  });

  it('maps unauthorized upstream to Chinese API key hint', () => {
    expect(formatUserError(new Error('Unauthorized: invalid api key'))).toBe(
      'API Key 无效或未授权。请在设置中检查密钥是否正确。',
    );
  });

  it('maps HTTP status patterns', () => {
    expect(formatUserError(new Error('HTTP error! status: 404'))).toBe(
      '服务请求失败（HTTP 404）',
    );
  });

  it('humanizes upstream no-account message', () => {
    expect(formatUserError('No available compatible accounts')).toContain('GPT Image');
  });
});

describe('hasChineseText', () => {
  it('detects CJK characters', () => {
    expect(hasChineseText('hello 中文')).toBe(true);
    expect(hasChineseText('Unauthorized')).toBe(false);
  });
});

describe('humanizeUpstreamError legacy', () => {
  it('still works for drawing gateway errors', () => {
    expect(humanizeUpstreamError('No available compatible accounts')).toContain('GPT Image');
  });
});
