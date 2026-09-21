import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCanvasPromptNodes } from './canvasPromptNodes.ts';

test('canvas prompt nodes stay generating without placeholder media', () => {
  const nodes = buildCanvasPromptNodes({
    promptText: '一只陶瓷杯',
    pan: { x: 0, y: 0 },
    zoom: 1,
    viewport: { clientWidth: 900, clientHeight: 600 },
    tasks: [{ id: 'node-1', taskId: 'task-1', prompt: '一只陶瓷杯', title: '陶瓷杯' }],
  });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].status, 'generating');
  assert.equal(nodes[0].imageUrl, undefined);
  assert.equal(nodes[0].videoUrl, undefined);
  assert.equal(JSON.stringify(nodes).includes('unsplash'), false);
  assert.equal(JSON.stringify(nodes).includes('mixkit'), false);
});
