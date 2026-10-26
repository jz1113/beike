import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMaterialSelection } from './useMaterialSelection';

const hooks = vi.hoisted(() => ({ index: 0, state: [] as unknown[], effects: [] as (() => void)[] }));
vi.mock('react', () => ({
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => hooks.effects.push(fn),
  useState: <T>(initial: T) => {
    const index = hooks.index++;
    if (!(index in hooks.state)) hooks.state[index] = initial;
    return [hooks.state[index], (next: T | ((previous: T) => T)) => {
      hooks.state[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.state[index] as T) : next;
    }];
  },
}));

function Render(ids = ['a', 'b'], scope = 'flat:ai', flush = true) {
  hooks.index = 0;
  hooks.effects = [];
  const selection = useMaterialSelection(ids.map((id) => ({ id })), scope);
  if (flush) hooks.effects.forEach((effect) => effect());
  return selection;
}

beforeEach(() => { hooks.index = 0; hooks.state = []; hooks.effects = []; });

describe('material selection', () => {
  it('only selects visible IDs and stops a card click from opening the preview', () => {
    const selection = Render();
    const event = { stopPropagation: vi.fn() };
    selection.toggle('a', event);
    selection.toggle('hidden');
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(Render().ids).toEqual(['a']);
  });

  it('excludes hidden IDs immediately, before effects run', () => {
    Render().toggle('a');
    expect(Render(['b'], 'flat:ai', false).ids).toEqual([]);
  });

  it('prunes removed items so they are not selected if they later reappear', () => {
    Render().toggleAll();
    expect(Render(['b']).ids).toEqual(['b']);
    expect(Render().ids).toEqual(['b']);
  });

  it.each(['flat:uploaded', 'flat:ai:video', 'flat:ai:search', 'project:ai', 'project:s2'])('clears selection when filter or project scope changes to %s', (scope) => {
    Render().toggle('a');
    expect(Render(['a', 'b'], scope).ids).toEqual([]);
    expect(Render().ids).toEqual([]);
  });

  it('selects all by membership even when a previous selection has the same count', () => {
    Render(['a']).toggleAll();
    const changed = Render(['b'], 'flat:ai', false);
    changed.toggleAll();
    expect(Render(['b']).ids).toEqual(['b']);
    Render(['b']).toggleAll();
    expect(Render(['b']).ids).toEqual([]);
  });

  it('clears selection on successful completion while supporting a failed operation retry', () => {
    Render().toggleAll();
    expect(Render().ids).toEqual(['a', 'b']);
    Render().clear();
    expect(Render().ids).toEqual([]);
  });
});
