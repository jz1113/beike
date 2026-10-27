import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { credentialGet } from '@client/shared/api/credentialClient';
import { resolveKeywordReviewRoute, type KeywordReviewModelOption } from '@client/shared/models/keywordReviewModels';
import { useKeywordReviewBalance } from './useKeywordReviewBalance';

const hooks = vi.hoisted(() => ({
  stateIndex: 0, refIndex: 0, states: [] as unknown[], refs: [] as { current: unknown }[],
  effect: undefined as (() => void | (() => void)) | undefined,
}));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => { hooks.effect = effect; },
  useRef: (current: unknown) => hooks.refs[hooks.refIndex++] ?? (hooks.refs[hooks.refIndex - 1] = { current }),
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = next; }];
  },
}));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/credentialClient', () => ({ credentialGet: vi.fn(async () => 'global-key') }));
vi.mock('@client/shared/models/keywordReviewModels', () => ({ resolveKeywordReviewRoute: vi.fn() }));

let cleanup: (() => void) | void;
function BalanceHarness(value = 'channel-a', enabled = true) {
  cleanup?.();
  hooks.stateIndex = 0; hooks.refIndex = 0;
  const model: KeywordReviewModelOption = {
    value, routeId: value, model: 'deepseek-flash', name: value, label: value,
    provider: 'deepseek', source: 'modality',
  };
  const result = useKeywordReviewBalance(enabled, model);
  cleanup = hooks.effect?.();
  return result;
}
const response = (total: string) => new Response(JSON.stringify({ success: true, currency: 'CNY', total }));
async function flush() { for (let index = 0; index < 20; index++) await Promise.resolve(); }

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  hooks.states = []; hooks.refs = []; cleanup = undefined;
  vi.mocked(resolveKeywordReviewRoute).mockImplementation((model) => ({
    provider: 'deepseek', model: model.model, baseUrl: 'https://api.deepseek.com',
    apiKey: `${model.value}-key`, keySource: 'channel',
  }));
});
afterEach(() => { cleanup?.(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('keyword balance account selection', () => {
  it('queries the selected official channel key instead of the global key', async () => {
    vi.mocked(apiFetch).mockResolvedValue(response('12'));
    BalanceHarness(); await flush();
    expect(credentialGet).not.toHaveBeenCalled();
    const body = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body));
    expect(body.customApiKey).toBe('channel-a-key');
    expect(hooks.states[0]).toMatchObject({ total: '12' });
  });

  it('retains the global key fallback for the built-in official route', async () => {
    vi.mocked(resolveKeywordReviewRoute).mockReturnValue({
      provider: 'deepseek', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com', apiKey: '', keySource: 'deepseek',
    });
    vi.mocked(apiFetch).mockResolvedValue(response('34'));
    BalanceHarness(); await flush();
    expect(credentialGet).toHaveBeenCalledWith('deepseek_api_key');
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body)).customApiKey).toBe('global-key');
  });

  it('ignores a late previous-account response and refreshes the newly selected account', async () => {
    let finishOld!: (value: Response) => void;
    let finishNew!: (value: Response) => void;
    vi.mocked(apiFetch)
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishNew = resolve; }));
    BalanceHarness(); await flush();
    BalanceHarness('channel-b');
    finishOld(response('999')); await flush();
    expect(hooks.states[0]).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[1][1]?.body)).customApiKey).toBe('channel-b-key');
    finishNew(response('56')); await flush();
    expect(hooks.states[0]).toMatchObject({ total: '56' });
  });

  it('does not display an in-flight response after balance polling is disabled', async () => {
    let finish!: (value: Response) => void;
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    BalanceHarness(); await flush();
    BalanceHarness('channel-a', false);
    finish(response('999')); await flush();
    expect(hooks.states[0]).toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
