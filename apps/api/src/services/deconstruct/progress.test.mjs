import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWithWorkspace } from '@beike/server-kit/workspaceContext';
import { getDeconstructProgress, updateDeconstructProgress } from './progress.ts';

test('deconstruct progress reflects stages and stays in its workspace', async () => {
  await runWithWorkspace('progress-a', () => {
    updateDeconstructProgress('task-1', 'preparing', '准备图片');
    updateDeconstructProgress('task-1', 'analyzing', '视觉分析');
    assert.equal(getDeconstructProgress('task-1')?.message, '视觉分析');
  });
  await runWithWorkspace('progress-b', () => {
    assert.equal(getDeconstructProgress('task-1'), null);
  });
});
