import { describe, expect, it } from 'vitest';
import { selectGenerationSlots } from './generationConcurrency';
import type { GenerationTask } from '@/types/app-store';
const make = (id: number, updates: Partial<GenerationTask> = {}): GenerationTask => ({
  id: `poster-${id}`, title: '', prompt: '', model: 'gpt-image-2', size: '2048x1152',
  quality: 'medium', useReferenceImage: true, status: 'IN_PROGRESS', progress: '0%', ...updates,
});
describe('generation concurrency', () => {
  it('queues 304 jobs with only 10 initial submissions', () => {
    expect(selectGenerationSlots(Array.from({ length: 304 }, (_, i) => make(i)), new Set())).toHaveLength(10);
  });
  it('keeps remote polling and slow jobs in their slots, deduplicating submit locks', () => {
    const tasks = Array.from({ length: 12 }, (_, i) => make(i, i < 9 ? { taskId: `remote-${i}`, failReason: '等待中' } : {}));
    expect(selectGenerationSlots(tasks, new Set(['poster-0', 'poster-9']))).toEqual([]);
    tasks[0] = make(0, { status: 'SUCCESS', resultUrl: '/done.png' });
    expect(selectGenerationSlots(tasks, new Set(['poster-9'])).map(t => t.id)).toEqual(['poster-10']);
  });
  it('frees failures without resubmitting failed or database-history tasks', () => {
    const tasks = [make(0, { status: 'FAILURE' }), make(1, { dbId: 'history' }), make(2)];
    expect(selectGenerationSlots(tasks, new Set()).map(t => t.id)).toEqual(['poster-2']);
  });
});
