import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { describeMediaPlaybackError } from '@client/shared/media/mediaPlayback';
import { StudioAudioPlayer, type StudioAudioPlayerProps } from './StudioAudioPlayer';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], cleanup: undefined as (() => void) | undefined }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useMemo: (create: () => unknown) => create(),
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = initial;
    return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = next; }];
  },
  useEffect: (effect: () => (() => void) | undefined) => {
    const index = hooks.index++;
    if (index in hooks.slots) return;
    hooks.slots[index] = true;
    hooks.cleanup = effect();
  },
}));
vi.mock('@client/shared/media/mediaPlayback', () => ({ describeMediaPlaybackError: vi.fn() }));

type Node = ReactElement<Record<string, unknown>>;
function descendants(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(descendants);
  if (!isValidElement<Record<string, unknown>>(value)) return [];
  return [value, ...descendants(value.props.children)];
}
function render(props: StudioAudioPlayerProps = { src: '/sample.mp3', label: '人声试听' }) {
  hooks.index = 0;
  const wrapper = StudioAudioPlayer(props);
  const content = wrapper.type as (input: StudioAudioPlayerProps) => ReactElement;
  const tree = content(props);
  return descendants(tree);
}
function click(nodes: Node[], label = '播放人声试听') {
  const button = nodes.find((node) => node.type === 'button' && node.props['aria-label'] === label);
  expect(button).toBeDefined();
  (button!.props.onClick as () => void)();
}
const settle = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.cleanup = undefined;
  vi.clearAllMocks();
  vi.mocked(describeMediaPlaybackError).mockResolvedValue('媒体服务暂时不可用，请确认后台服务已启动后重试。');
});

describe('studio audio playback recovery', () => {
  it('shows the diagnosed failure and reloads a failed audio source when retrying', async () => {
    let nodes = render();
    const audio = { paused: true, error: { code: 2 }, play: vi.fn().mockRejectedValue(new Error('network')), load: vi.fn(), pause: vi.fn() };
    ((nodes.find((node) => node.type === 'audio')!.props.ref) as { current: unknown }).current = audio;
    click(nodes);
    await settle();
    nodes = render();
    expect(describeMediaPlaybackError).toHaveBeenCalledWith('/sample.mp3', 2, expect.any(AbortSignal));
    expect(nodes.some((node) => node.props.role === 'status')).toBe(true);
    expect(JSON.stringify(nodes.find((node) => node.props.role === 'status')?.props.children)).toContain('后台服务已启动');
    audio.play.mockResolvedValue(undefined);
    click(nodes, '重试人声试听');
    expect(audio.load).toHaveBeenCalledTimes(2);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(render().some((node) => node.props.role === 'status')).toBe(false);
  });

  it('ignores cancellation and does not report an interrupted preview as a file failure', async () => {
    const nodes = render();
    const audio = { paused: true, error: null, play: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')), pause: vi.fn() };
    ((nodes.find((node) => node.type === 'audio')!.props.ref) as { current: unknown }).current = audio;
    click(nodes);
    await settle();
    expect(describeMediaPlaybackError).not.toHaveBeenCalled();
    expect(render().some((node) => node.props.role === 'status')).toBe(false);
  });

  it('resets the player for a new source and pauses other audio previews when one starts', () => {
    expect(StudioAudioPlayer({ src: '/voice-a.mp3' }).key).not.toBe(StudioAudioPlayer({ src: '/voice-b.mp3' }).key);
    const nodes = render();
    const other = { pause: vi.fn() };
    const current = { ownerDocument: { querySelectorAll: () => [current, other] } };
    (nodes.find((node) => node.type === 'audio')!.props.onPlay as (event: unknown) => void)({ currentTarget: current });
    expect(other.pause).toHaveBeenCalledOnce();
    expect(render().some((node) => node.props['aria-label'] === '暂停人声试听')).toBe(true);
  });
});
