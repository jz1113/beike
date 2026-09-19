// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FeedImage } from '../components/inspiration/FeedImage';
import { LazyFeedVideo } from '../components/inspiration/LazyFeedVideo';
vi.mock('@/lib/videoPlaybackManager', () => ({ videoPlaybackManager: { safePause: vi.fn(), safePlay: vi.fn(async () => true) } }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('bounds automatic retries, removes broken images, and allows a manual retry', () => {
  vi.useFakeTimers();
  const { container } = render(<FeedImage src="/inspirations/a.jpg" alt="asset" />);
  fireEvent.error(screen.getByAltText('asset'));
  expect(container.querySelector('img')).toBeNull();
  act(() => vi.advanceTimersByTime(800));
  fireEvent.error(screen.getByAltText('asset'));
  act(() => vi.advanceTimersByTime(1600));
  fireEvent.error(screen.getByAltText('asset'));
  act(() => vi.advanceTimersByTime(10000));
  expect(container.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByText('重新加载'));
  expect(container.querySelector('img')?.getAttribute('src')).toBe('/inspirations/a.jpg');
});
it('resets the failure state when the source changes', () => {
  const { rerender } = render(<FeedImage src="/a.jpg" alt="asset" />);
  fireEvent.error(screen.getByAltText('asset'));
  rerender(<FeedImage src="/b.jpg" alt="asset" />);
  expect(screen.getByAltText('asset').getAttribute('src')).toBe('/b.jpg');
});
it('does not request video bytes until hovered when a poster is available', () => {
  const { container } = render(<LazyFeedVideo src="/large.mp4" poster="/poster.jpg" />);
  expect(container.querySelector('video')?.getAttribute('src')).toBeNull();
  fireEvent.mouseEnter(container.firstElementChild!);
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/large.mp4');
});
it('falls back to the video when the poster exhausts retries', () => {
  vi.useFakeTimers();
  const { container } = render(<LazyFeedVideo src="/large.mp4" poster="/poster.jpg" />);
  for (const delay of [800, 1600, 0]) {
    fireEvent.error(container.querySelector('img')!);
    act(() => vi.advanceTimersByTime(delay));
  }
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('video')?.getAttribute('src')).toBe('/large.mp4');
});
