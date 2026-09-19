import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { persistDrawingStateToStorage } from './generation';

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

it('coalesces partial updates without losing tasks or restoring the previous session', () => {
  const tasks = [{ id: 'task', prompt: 'test', status: 'SUCCESS' as const }];
  persistDrawingStateToStorage(tasks, [{ id: 'a', title: 'A', createdAt: 1, tasks }], 'a');
  persistDrawingStateToStorage(undefined, undefined, 'b');
  expect(localStorage.getItem('drawing_sessions')).toBeNull();
  vi.advanceTimersByTime(150);
  expect(JSON.parse(localStorage.getItem('drawing_all_generations')!)).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem('drawing_sessions')!)[0].id).toBe('a');
  expect(localStorage.getItem('drawing_current_session_id')).toBe('b');
});

it('a clear replaces a pending save instead of resurrecting old records', () => {
  persistDrawingStateToStorage([{ id: 'old', prompt: '', status: 'SUCCESS' }], [], 'old');
  persistDrawingStateToStorage([], [], 'new');
  vi.advanceTimersByTime(150);
  expect(JSON.parse(localStorage.getItem('drawing_all_generations')!)).toEqual([]);
  expect(localStorage.getItem('drawing_current_session_id')).toBe('new');
});
