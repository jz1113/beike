import test from 'node:test';
import assert from 'node:assert/strict';
import { savedWorkshopOutputSize } from './workshopOutputSize.ts';
import { prepareTaskRetry } from './taskRetry.ts';

test('single-shot redo of a grid slice retains the slice size, not the master size', () => {
  const legacy = { id: 't', gridSize: '2496x3328' };
  assert.equal(savedWorkshopOutputSize(legacy), '1248x1664');
  const retry = prepareTaskRetry(legacy);
  assert.equal(retry.gridSize, undefined);
  assert.equal(retry.outputSize, '1248x1664');
  assert.equal(prepareTaskRetry(retry).outputSize, '1248x1664');
  assert.equal(savedWorkshopOutputSize({ outputSize: '960x1280', gridSize: '2496x3328' }), '960x1280');
});

test('legacy missing and invalid sizes are not fabricated', () => {
  for (const task of [undefined, {}, { gridSize: '3:4' }, { gridSize: '0x0' }]) {
    assert.equal(savedWorkshopOutputSize(task), undefined);
  }
});
