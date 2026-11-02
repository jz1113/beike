import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSalesAssetDraft } from './useSalesAssetDraft';
import { readSalesAssetDraft, salesAssetDraftKey } from '../model/salesAssetDraft';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: undefined as (() => void) | undefined, workspace: 'workspace' }));
vi.mock('react', () => ({
  useEffect: (fn: () => (() => void)) => { if (!hooks.cleanup) hooks.cleanup = fn(); },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (next: T) => { hooks.slots[index] = next; }];
  },
}));
vi.mock('@client/shared/api/workspaceClient', () => ({ getWorkspaceSecret: () => hooks.workspace }));
let values: Map<string, string>;
const setItem = vi.fn();
const addEventListener = vi.fn();
function Render(kind: 'persona' | 'scene' = 'persona', id?: string) {
  hooks.index = 0;
  return useSalesAssetDraft(kind, id, { name: '', group: 'female', voiceId: '' });
}
function unmount() { hooks.cleanup?.(); hooks.slots = []; hooks.cleanup = undefined; }
beforeEach(() => {
  hooks.slots = []; hooks.cleanup = undefined; hooks.workspace = 'workspace'; values = new Map(); vi.resetAllMocks();
  setItem.mockImplementation((key: string, value: string) => { values.set(key, value); });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem, removeItem: (key: string) => values.delete(key) });
  vi.stubGlobal('window', { addEventListener, removeEventListener: vi.fn() });
});
afterEach(() => { unmount(); vi.unstubAllGlobals(); });

it('synchronously retains typed fields and asynchronous image progress after closing and reopening', () => {
  const initial = Render();
  expect(initial.status).toBe('idle');
  initial.setField('name', '新人物');
  expect(Render().status).toBe('saved');
  Render().setField('voiceId', '声音');
  // Generation callback retains an earlier render, while the user has edited fields.
  initial.update({ views: { main: '/uploaded.jpg' }, request: { key: 'paid-once', model: 'm', references: ['/uploaded.jpg'], taskId: 'task' } });
  unmount();
  const restored = Render();
  expect(restored.restored).toBe(true);
  expect(restored.status).toBe('restored');
  expect(restored.fields).toMatchObject({ name: '新人物', voiceId: '声音' });
  expect(restored.saved).toMatchObject({ views: { main: '/uploaded.jpg' }, request: { key: 'paid-once', taskId: 'task' } });
});

it('removes only the completed asset draft after a confirmed save', () => {
  Render().setField('name', 'new');
  const unrelated = salesAssetDraftKey('other-workspace', 'persona'); values.set(unrelated, 'keep');
  expect(Render().clear()).toBe(true);
  expect(Render().status).toBe('idle');
  expect(readSalesAssetDraft(salesAssetDraftKey('workspace', 'persona'))).toBeNull();
  expect(values.get(unrelated)).toBe('keep');
  unmount(); expect(Render().restored).toBe(false);
});

it('keeps unsaved state in memory and warns before unload when storage fails, then retries', () => {
  setItem.mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  Render().setField('name', '不能丢');
  expect(Render().fields.name).toBe('不能丢');
  expect(Render().error).toContain('保存失败');
  expect(Render().status).toBe('error');
  expect(Render().flush()).toBe(false);
  const event = { preventDefault: vi.fn(), returnValue: undefined };
  addEventListener.mock.calls[0][1](event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  setItem.mockImplementation((key: string, value: string) => values.set(key, value));
  expect(Render().flush()).toBe(true);
  expect(Render().error).toBe('');
  expect(Render().status).toBe('saved');
  unmount(); expect(Render().fields.name).toBe('不能丢');
});
