import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LazyFeedVideo } from './LazyFeedVideo';
import { FeedImage } from './FeedImage';
import { InspirationReferences } from './InspirationReferences';

const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as (() => void | (() => void))[],
  stateIndex: 0, refIndex: 0, active: true,
  intersections: [] as ((entries: { isIntersecting: boolean }[]) => void)[],
  play: vi.fn(async () => true), pause: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: <T,>(initial: T) => {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: T | ((previous: T) => T)) => {
      harness.states[index] = typeof value === 'function' ? (value as (previous: T) => T)(harness.states[index] as T) : value;
    }];
  },
  useRef: <T,>(current: T) => {
    const index = harness.refIndex++;
    return harness.refs[index] ||= { current };
  },
  useCallback: <T,>(callback: T) => callback,
  useId: () => 'reference-preview',
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
}));
vi.mock('react-dom', () => ({ createPortal: (children: ReactElement) => children }));
vi.mock('@client/shared/media/videoPlaybackManager', () => ({ videoPlaybackManager: { safePlay: harness.play, safePause: harness.pause } }));
vi.mock('@client/shared/hooks/useViewVisibility', () => ({ useViewVisibility: () => harness.active }));
vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => `/api/system/proxy-image?url=${encodeURIComponent(url)}` }));

type VideoTree = ReactElement<{ onMouseEnter: () => void; onMouseLeave: () => void; children: ReactElement<{ src?: string; ref: { current: unknown } }>[] }>;
type ImageTree = ReactElement<{ children: [ReactElement<{ src: string; onError: () => void }>, unknown] }>;
type ReferenceTree = ReactElement<{ children: [ReactElement<{ ref: { current: unknown }; onFocus: () => void; onClick: () => void; 'aria-expanded': boolean }>, unknown] }>;
function prepareRender() { harness.stateIndex = 0; harness.refIndex = 0; harness.effects = []; }
function renderVideo(poster: string | null = '/poster.jpg') {
  prepareRender();
  return LazyFeedVideo({ src: '/movie.mp4', poster: poster ?? undefined }) as VideoTree;
}
function renderImage(onUnavailable = vi.fn()) {
  prepareRender();
  return FeedImage({ src: '/thumbnail.jpg', fallbackSrc: 'https://cdn.example.com/full.png', onUnavailable }) as ImageTree;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.assign(harness, { states: [], refs: [], effects: [], intersections: [], active: true });
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 900, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { harness.intersections.push(callback); }
    observe = vi.fn();
    disconnect = vi.fn();
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('home preview loading', () => {
  it('keeps references open after focus followed by click, and dismisses only the reference preview', () => {
    const onPreviewChange = vi.fn();
    const render = () => {
      prepareRender();
      return InspirationReferences({ images: ['/person.png', '/dress.png'], onPreviewChange }) as ReferenceTree;
    };
    const focus = vi.fn();
    let references = render();
    references.props.children[0].props.ref.current = { getBoundingClientRect: () => ({ left: 100, top: 400, bottom: 424 }), closest: () => ({}), focus };
    references.props.children[0].props.onFocus();
    references = render();
    expect(references.props.children[0].props['aria-expanded']).toBe(true);
    references.props.children[0].props.onClick();
    references = render();
    expect(references.props.children[0].props['aria-expanded']).toBe(true);
    harness.effects[0]();
    const dismiss = onPreviewChange.mock.lastCall?.[0];
    expect(dismiss).toBeTypeOf('function');
    dismiss();
    expect(render().props.children[0].props['aria-expanded']).toBe(false);
    expect(focus).toHaveBeenCalledOnce();
  });

  it('starts the first hover playback only after the source is attached', async () => {
    const initial = renderVideo();
    initial.props.children[0].props.ref.current = { currentTime: 0 };
    harness.effects[0]();
    expect(initial.props.children[0].props.src).toBeUndefined();
    initial.props.onMouseEnter();
    vi.advanceTimersByTime(140);
    expect(harness.play).not.toHaveBeenCalled();
    const committed = renderVideo();
    expect(committed.props.children[0].props.src).toBe('/movie.mp4');
    harness.effects[1]();
    await Promise.resolve();
    expect(harness.play).toHaveBeenCalledOnce();
  });

  it('does not download all posterless videos before they enter the viewport', () => {
    const initial = renderVideo(null);
    initial.props.children[0].props.ref.current = {};
    harness.effects[0]();
    expect(initial.props.children[0].props.src).toBeUndefined();
    harness.intersections[0]([{ isIntersecting: true }]);
    const visible = renderVideo(null);
    expect(visible.props.children[0].props.src).toBe('/movie.mp4');
    harness.effects[1]();
    expect(harness.play).not.toHaveBeenCalled();
  });

  it('cancels incidental pointer sweeps and suspends hidden keep-alive previews', () => {
    const initial = renderVideo();
    initial.props.children[0].props.ref.current = {};
    harness.effects[0]();
    initial.props.onMouseEnter();
    initial.props.onMouseLeave();
    vi.advanceTimersByTime(500);
    expect(renderVideo().props.children[0].props.src).toBeUndefined();
    harness.active = false;
    renderVideo();
    harness.effects[0]();
    expect(harness.intersections).toHaveLength(1);
    expect(harness.pause).toHaveBeenCalled();
  });

  it('falls back from a broken thumbnail to the original and proxy, then stops retrying', () => {
    const unavailable = vi.fn();
    let image = renderImage(unavailable);
    expect(image.props.children[0].props.src).toBe('/thumbnail.jpg');
    for (let attempt = 0; attempt < 2; attempt++) {
      image.props.children[0].props.onError();
      renderImage(unavailable);
      harness.effects[1]();
      vi.advanceTimersByTime(800 * (attempt + 1));
      image = renderImage(unavailable);
      expect(image.props.children[0].props.src).toBe(attempt === 0 ? 'https://cdn.example.com/full.png' : '/api/system/proxy-image?url=https%3A%2F%2Fcdn.example.com%2Ffull.png');
    }
    image.props.children[0].props.onError();
    renderImage(unavailable);
    harness.effects[1]();
    expect(unavailable).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
