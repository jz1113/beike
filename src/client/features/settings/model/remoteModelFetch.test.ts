import { describe, expect, it } from 'vitest';
import { parseRemoteModelFetch } from './remoteModelFetch';

describe('parseRemoteModelFetch', () => {
  it('keeps the gateway model ids from a real catalog', () => {
    const parsed = parseRemoteModelFetch({
      success: true,
      models: [{ id: 'vendor/claude-opus-4-6', name: 'Claude Opus' }, { id: 'custom-model' }],
    });
    expect(parsed).toEqual({ ok: true, ids: ['vendor/claude-opus-4-6', 'custom-model'] });
  });

  it('does not treat the official fallback catalog as a remote pull', () => {
    const parsed = parseRemoteModelFetch({
      success: true,
      isFallback: true,
      warning: '已自动载入官方精选推荐模型库',
      models: [{ id: 'gpt-6-sol' }, { id: 'claude-opus-5' }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain('官方精选');
  });

  it('reports a failed catalog without exposing fallback models', () => {
    const parsed = parseRemoteModelFetch({ success: false, error: '网络连接失败', models: [{ id: 'gpt-image-2' }] });
    expect(parsed).toEqual({ ok: false, message: '网络连接失败' });
  });
});
