import { expect, it, vi } from 'vitest';
import { runSingleShotGeneration } from '../batchShotRunner';
import type { BatchProductItem } from '../batchTypes';

it('does not repeat terminal or ambiguous submissions for either anchor or later shots', async () => {
  const execute = vi.fn().mockRejectedValue(Object.assign(new Error('提交响应未确认'), { retryable: false }));
  const item = { id: 'product', prompts: [], tasks: [{ status: 'PENDING' }, { status: 'PENDING' }] } as unknown as BatchProductItem;
  await runSingleShotGeneration(item, item.id, [
    { shot_no: 1, prompt: 'first', has_human: false },
    { shot_no: 2, prompt: 'second', has_human: false },
  ], { hasHumanPersona: false, isAborted: () => false, executeSingleImageTask: execute, updateItemTasks: vi.fn(), bumpProgress: vi.fn() });
  expect(execute).toHaveBeenCalledTimes(2);
});
