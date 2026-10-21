import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesNavigation } from '../model/salesWorkspaceView';
import { defaultSalesStudioState } from '../model/salesStudioDraft';
import { useSalesNavigation } from './useSalesNavigation';

const hooks = vi.hoisted(() => ({ navigation: undefined as SalesNavigation | undefined, ref: undefined as { current: unknown } | undefined, effects: [] as (() => void)[] }));
vi.mock('react', () => ({
  useState: (initial: () => SalesNavigation) => {
    hooks.navigation ??= initial();
    return [hooks.navigation, (next: (previous: SalesNavigation) => SalesNavigation) => { hooks.navigation = next(hooks.navigation!); }];
  },
  useRef: (current: unknown) => { hooks.ref ??= { current }; return hooks.ref; },
  useEffect: (effect: () => void) => hooks.effects.push(effect),
}));

type Input = Parameters<typeof useSalesNavigation>[0];
function NavigationHarness(patch: Partial<Input> = {}) {
  const input: Input = {
    state: { ...defaultSalesStudioState, workspaceNavigation: { step: 'product', lastCreativeStep: 'plan' } },
    script: { id: 'old', title: '', totalDuration: 15, shots: [], finalizedRevision: 'old-prompt', seo: { title: '', description: '', hashtags: [], coverText: '', interactionGuide: '' } },
    hasResult: false, isPlanning: false, isFinalizing: false, isRendering: false, updateState: vi.fn(), ...patch,
  };
  useSalesNavigation(input);
  hooks.effects.splice(0).forEach((effect) => effect());
  return input;
}
beforeEach(() => { hooks.navigation = undefined; hooks.ref = undefined; hooks.effects = []; });

describe('sales navigation after asynchronous work', () => {
  it('keeps the current stage when planning fails with an old script still present', () => {
    const input = NavigationHarness();
    NavigationHarness({ ...input, isPlanning: true });
    NavigationHarness(input);
    expect(hooks.navigation?.step).toBe('product');
  });
  it('opens the script only after a new script is committed', () => {
    const input = NavigationHarness();
    NavigationHarness({ ...input, isPlanning: true });
    const updated = { ...input, script: { ...input.script!, id: 'new' } };
    NavigationHarness({ ...updated, isPlanning: true });
    NavigationHarness(updated);
    expect(hooks.navigation?.step).toBe('plan');
  });
  it('keeps the current stage when finalization is cancelled with an old prompt', () => {
    const input = NavigationHarness();
    NavigationHarness({ ...input, isFinalizing: true });
    NavigationHarness(input);
    expect(hooks.navigation?.step).toBe('product');
  });
  it('opens video finalization after the new revision arrives', () => {
    const input = NavigationHarness();
    NavigationHarness({ ...input, isFinalizing: true });
    const updated = { ...input, script: { ...input.script!, finalizedRevision: 'new-prompt' } };
    NavigationHarness({ ...updated, isFinalizing: true });
    NavigationHarness(updated);
    expect(hooks.navigation?.step).toBe('video');
  });
  it('opens results when video generation starts', () => {
    const input = NavigationHarness();
    NavigationHarness({ ...input, isRendering: true });
    expect(hooks.navigation?.step).toBe('result');
  });
});
