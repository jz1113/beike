import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesActionCandidate } from '@shared/domain/sales';
import { useSalesDepthConversion, type DepthJob } from '../hooks/useSalesDepthConversion';
import { SalesDepthWorkspace } from './SalesDepthWorkspace';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: [] as (() => unknown)[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => unknown, dependencies?: readonly unknown[]) => {
    const index = hooks.index++;
    const previous = hooks.slots[index] as readonly unknown[] | undefined;
    if (!previous || !dependencies || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
      hooks.slots[index] = dependencies;
      hooks.effects.push(effect);
    }
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
}));
vi.mock('../hooks/useSalesDepthConversion', () => ({ useSalesDepthConversion: vi.fn() }));
vi.mock('@client/shared/api/generation/depthGeneration', () => ({ useDepthEnvCheck: () => ({ loading: false, depthModelReady: true }) }));
vi.mock('@client/shared/api/generation/seedancePrecheck', () => ({ useSeedancePrecheck: () => new Map() }));
vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));
const start = vi.fn(); const resume = vi.fn();
let currentJob: DepthJob | null = null;
let error = '';
const source: SalesActionCandidate = { id: 'action', title: '转身', coverUrl: '', action: '', shotType: '', camera: '', mediaType: 'video', mediaUrl: '/original.mp4', tags: '', productCategoryIds: [] };
const job: DepthJob = { operationId: 'original', video: true, sourceUrl: '/original.mp4', name: '转身', description: '', style: 'mocap', quality: 'standard', taskId: 'original-task' };
function Render(selected: SalesActionCandidate | null = source) {
  hooks.index = 0;
  const element = SalesDepthWorkspace({ enabled: true, source: selected, onSaved: vi.fn() });
  const effects = hooks.effects.splice(0); effects.forEach((effect) => effect());
  return element;
}
beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effects = [];
  vi.resetAllMocks(); currentJob = null; error = '';
  start.mockResolvedValue(undefined); resume.mockResolvedValue(undefined);
  vi.mocked(useSalesDepthConversion).mockImplementation(() => ({
    job: currentJob, busy: false, progress: '', error,
    // The real hook creates fresh functions as state changes.
    start: (input) => start(input), resume: () => resume(), save: vi.fn(), reset: vi.fn(),
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('automatic depth conversion boundaries', () => {
  it('tries each selected source once and waits for explicit retry after failure', () => {
    Render();
    error = '读取素材失败';
    for (let i = 0; i < 5; i += 1) Render();
    expect(start).toHaveBeenCalledTimes(1);
    Render({ ...source, mediaUrl: '/another.mp4' });
    expect(start).toHaveBeenCalledTimes(2);
  });
  it('automatically queries a restored task once, without an error retry loop', () => {
    currentJob = job;
    Render();
    error = '查询失败';
    for (let i = 0; i < 5; i += 1) Render();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });
  it('does not start another conversion when a restored completed result is saved', () => {
    currentJob = { ...job, resultUrl: '/result.mp4' };
    Render();
    currentJob = null;
    for (let i = 0; i < 3; i += 1) Render();
    expect(start).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });
});


describe('video metadata cleanup and fallback', () => {
  function prepareProbe() {
    vi.useFakeTimers();
    const video = {
      onloadedmetadata: null as (() => void) | null, onerror: null as (() => void) | null,
      duration: 3, videoWidth: 720, videoHeight: 1280,
      removeAttribute: vi.fn(), load: vi.fn(),
    };
    vi.stubGlobal('document', { createElement: () => video });
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:metadata').mockReturnValue('blob:preview');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const fileInput = Render(null).props.children[0];
    const selected = new File(['video'], 'action.mp4', { type: 'video/mp4' });
    fileInput.props.onChange({ target: { files: [selected], value: 'selected' } });
    return { video, revoke, selected };
  }
  it('releases the metadata object URL and timeout before starting conversion', async () => {
    const { video, revoke, selected } = prepareProbe();
    video.onloadedmetadata?.();
    await Promise.resolve();
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ file: selected, width: 720, height: 1280, durationSec: 3 }));
    expect(revoke).toHaveBeenCalledWith('blob:metadata');
    expect(revoke).not.toHaveBeenCalledWith('blob:preview');
    expect(video.onloadedmetadata).toBeNull();
    expect(video.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('continues through the existing server-validation path when metadata times out', async () => {
    const { video, revoke, selected } = prepareProbe();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ file: selected, video: true, width: undefined, durationSec: undefined }));
    expect(revoke).toHaveBeenCalledWith('blob:metadata');
    expect(video.onloadedmetadata).toBeNull();
    expect(video.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
