import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGenerationTasks, needsGenerationSubmit } from './mergeGenerationTasks.ts';

const context = { batchId: 'batch', storyboardRevision: 1, model: 'gpt-image-2', aspectRatio: '3:4', quality: 'high' };
const item = {
  id: 'product', selectedProductImages: ['product.jpg'], gridPrompt: 'four views', tasks: [],
  prompts: [1, 2, 3, 4].map((n) => ({ shot_no: n, title: `镜头${n}`, prompt: `view ${n}` })),
};
const complete = (tasks) => tasks.map((task) => ({ ...task, status: 'SUCCESS', resultUrl: '/storage/result.jpg' }));

test('switching strategies submits four new shots rather than reusing incompatible results', () => {
  const single = mergeGenerationTasks(item, { ...context, generationStrategy: 'single_shot' });
  const grid = mergeGenerationTasks({ ...item, tasks: complete(single) }, { ...context, generationStrategy: 'grid_first' });
  assert.equal(grid.length, 4);
  assert.ok(grid.every(needsGenerationSubmit));
  const switchedBack = mergeGenerationTasks({ ...item, tasks: complete(grid) }, { ...context, generationStrategy: 'single_shot' });
  assert.ok(switchedBack.every(needsGenerationSubmit));
});

test('grid edits invalidate all four results; unchanged prompts retain successful results', () => {
  const gridContext = { ...context, generationStrategy: 'grid_first' };
  const saved = { ...item, tasks: complete(mergeGenerationTasks(item, gridContext)) };
  assert.ok(mergeGenerationTasks(saved, gridContext).every((task) => !needsGenerationSubmit(task)));
  assert.ok(mergeGenerationTasks({ ...saved, gridPrompt: 'edited four views' }, gridContext).every(needsGenerationSubmit));
});

test('single-shot edits regenerate only the affected shot and preserve legacy single-shot keys', () => {
  const saved = { ...item, tasks: complete(mergeGenerationTasks(item, context)) };
  const next = mergeGenerationTasks({ ...saved, prompts: saved.prompts.map((shot, index) => index === 1 ? { ...shot, prompt: 'edited' } : shot) }, { ...context, generationStrategy: 'single_shot' });
  assert.deepEqual(next.map(needsGenerationSubmit), [false, true, false, false]);
});
