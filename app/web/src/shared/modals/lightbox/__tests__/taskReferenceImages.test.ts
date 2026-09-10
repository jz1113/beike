import { expect, it } from 'vitest';
import { extractTaskReferenceImages } from '../taskReferenceImages';
it('retains legacy nested references and order without duplicates', () => {
  expect(extractTaskReferenceImages({referenceImages:[' a ',['b',null]],params:{images:['c']},rawTask:{images:['b','d']}})).toEqual(['a','b','c','d']);
});
it('terminates on malformed cyclic data', () => {
  const task: Record<string,unknown> = {images:['a']}; task.rawTask=task;
  expect(extractTaskReferenceImages(task)).toEqual(['a']);
  expect(extractTaskReferenceImages(null)).toEqual([]);
});
