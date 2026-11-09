import { isValidElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasAudioNode } from './CanvasAudioNode';
import { apiFetch } from '@client/shared/api/apiClient';
import { saveCanvasProjects } from '../../store/useCanvasStore';
import { recordChatTokens } from '@client/shared/utils/modelUsage';
import type { CanvasNode } from '../../model/types';

const state = vi.hoisted(() => ({ update: vi.fn(), cleanups: [] as Array<() => void> }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => [initial, vi.fn()], useRef: (current: unknown) => ({ current }),
  useEffect: (setup: () => (() => void) | undefined) => { const cleanup = setup(); if (cleanup) state.cleanups.push(cleanup); },
}));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn(), proxyMediaUrl: (url: string) => url }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getGatewayClientHeaders: () => ({}) }));
vi.mock('@client/shared/utils/modelUsage', async original => ({ ...await original<typeof import('@client/shared/utils/modelUsage')>(), recordChatTokens: vi.fn() }));
vi.mock('../../model/studioGeneration', () => ({ studioChannels: () => [{ id: 'voice', kind: 'voice', route: 'original', modelId: 'speech-2.8-hd' }] }));
vi.mock('../../store/useCanvasStore', () => ({ useCanvasStore: (select: (store: { updateNode: typeof state.update }) => unknown) => select({ updateNode: state.update }), saveCanvasProjects: vi.fn() }));
let node: CanvasNode;
function generate() {
  const tree = CanvasAudioNode({ node, nodes: [node], projectId: 'legacy-project', selected: true }) as ReactNode;
  function button(value: ReactNode): (() => Promise<void>) | undefined {
    if (Array.isArray(value)) return value.map(button).find(Boolean);
    if (!isValidElement<{ children?: ReactNode; onClick?: (event: { stopPropagation: () => void }) => Promise<void> }>(value)) return;
    if (value.type === 'button' && value.props.onClick) return () => value.props.onClick!({ stopPropagation: () => {} });
    return button(value.props.children);
  }
  const click = button(tree);
  if (!click) throw Error('配音生成按钮不存在');
  return click;
}
beforeEach(() => {
  vi.clearAllMocks(); state.cleanups.length = 0;
  const rows = new Map<string, string>([['beike_workspace_secret', 'original-workspace-secret-'.repeat(3)]]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => rows.set(key, value) });
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { locks: { request: async (_key: string, _options: unknown, callback: () => unknown) => callback() } });
  node = { id: 'audio', type: 'audio', content: '朗读文字', x: 0, y: 0, width: 200, height: 200, createdAt: 1 };
  state.update.mockImplementation((_project: string, _node: string, patch: Partial<CanvasNode>) => { node = { ...node, ...patch }; });
  vi.mocked(saveCanvasProjects).mockResolvedValue(undefined);
});
afterEach(() => { vi.unstubAllGlobals(); });

it('S10 legacy audio nodes recover a lost first response with the original operation and retain normal usage accounting', async () => {
  vi.mocked(apiFetch).mockRejectedValueOnce(Error('response lost'));
  await generate()();
  const id = node.speechOperationId;
  expect(node).toMatchObject({ status: 'error', speechRecoveryRequired: true, taskId: id });
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, audioUrl: '/recovered.mp3', usage: { totalTokens: 7 } }));
  await generate()();
  expect(node).toMatchObject({ status: 'success', audioUrl: '/recovered.mp3', speechOperationId: id, speechRecoveryRequired: false });
  expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
  expect(vi.mocked(apiFetch).mock.calls[1][0]).toBe('/api/generate/audio?taskKey=' + id);
  expect(recordChatTokens).toHaveBeenCalledWith(expect.objectContaining({ operationId: id, usage: expect.objectContaining({ totalTokens: 7 }) }));
});

it('S10 synchronous repeated legacy clicks submit once; unmount abort keeps the saved operation recoverable', async () => {
  vi.mocked(apiFetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  const click = generate();
  const first = click(), duplicate = click();
  await duplicate;
  await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledOnce());
  expect(node.speechOperationId).toBeTruthy();
  state.cleanups.forEach(cleanup => cleanup());
  await first;
  expect(node.speechRecoveryRequired).toBe(true);
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ success: true, audioUrl: '/reopened.mp3' }));
  await generate()();
  expect(vi.mocked(apiFetch).mock.calls.map(([, init]) => init?.method || 'GET')).toEqual(['POST', 'GET']);
  expect(node.audioUrl).toBe('/reopened.mp3');
});
