import { afterEach, describe, expect, it, vi } from 'vitest';
import { filterMaterialTasks, groupTasksByTimeline, type MaterialFilterOptions } from './materialTimeline';

const options: MaterialFilterOptions = { sourceType: 'ai', mediaCategory: 'all', searchInput: '', sortOrder: 'newest' };
afterEach(() => vi.useRealTimers());

describe('material filtering and timeline', () => {
  it('keeps generated reference-based results out of uploads and uploads out of AI results', () => {
    const generated = { id: 'generated', resultUrl: '/result.png', referenceImageUrl: '/reference.png' };
    const uploaded = { id: 'uploaded', resultUrl: '/upload.png', isUploaded: true };
    const tasks = [generated, uploaded];
    expect(filterMaterialTasks(tasks, { ...options, sourceType: 'uploaded' })).toEqual([uploaded]);
    expect(filterMaterialTasks(tasks, options)).toEqual([generated]);
  });

  it('combines media, search and completion filters without changing the input', () => {
    const tasks = [
      { id: 'video', title: '产品 Video', mediaType: 'video', resultUrl: '/video.mp4', createdAt: 2 },
      { id: 'image', title: '产品 Image', mediaType: 'image', resultUrl: '/image.png', createdAt: 3 },
      { id: 'failed', title: '产品 Video', mediaType: 'video', status: 'FAILURE', createdAt: 4 },
    ];
    expect(filterMaterialTasks(tasks, { ...options, mediaCategory: 'video', searchInput: ' VIDEO ', statusFilter: 'completed' }).map((task) => task.id)).toEqual(['video']);
    expect(tasks.map((task) => task.id)).toEqual(['video', 'image', 'failed']);
  });

  it('orders today, yesterday and earlier dates in both chronological directions', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 12));
    const tasks = [26, 25, 24].map((day) => ({ id: String(day), createdAt: new Date(2026, 9, day, 10).getTime() }));
    expect(groupTasksByTimeline(tasks, 'newest').map((group) => group.key)).toEqual(['today', 'yesterday', '2026-10-24']);
    expect(groupTasksByTimeline(tasks, 'oldest').map((group) => group.key)).toEqual(['2026-10-24', 'yesterday', 'today']);
  });

  it('uses calendar boundaries for today and excludes future records from the time filter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 26, 12));
    const tasks = [25, 26, 27].map((day) => ({ id: String(day), createdAt: new Date(2026, 9, day, 10).getTime() }));
    expect(filterMaterialTasks(tasks, { ...options, timeFilter: 'today' }).map((task) => task.id)).toEqual(['26']);
    expect(filterMaterialTasks(tasks, { ...options, timeFilter: 'yesterday' }).map((task) => task.id)).toEqual(['25']);
  });

  it('preserves global alphabetical order across dates instead of regrouping by time', () => {
    const tasks = [{ id: 'z', title: 'Z', createdAt: 20 }, { id: 'a', title: 'A', createdAt: 10 }];
    const sorted = filterMaterialTasks(tasks, { ...options, sortOrder: 'name' });
    expect(groupTasksByTimeline(sorted, 'name').flatMap((group) => group.tasks.map((task) => task.id))).toEqual(['a', 'z']);
    expect(groupTasksByTimeline([], 'name')).toEqual([]);
  });
});
