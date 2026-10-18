import { describe, expect, it } from 'vitest';
import { applyItemEvent } from './turnItems';

describe('applyItemEvent', () => {
  it('keeps streamed reply text when the completed event is empty', () => {
    const started = applyItemEvent([], { type: 'item/started', itemId: 'm1', kind: 'agentMessage' });
    const streamed = applyItemEvent(started, { type: 'item/agentMessage/delta', itemId: 'm1', delta: '画面是一只白猫。' });
    const completed = applyItemEvent(streamed, { type: 'item/agentMessage/completed', itemId: 'm1', content: '' });
    const missing = applyItemEvent(streamed, { type: 'item/agentMessage/completed', itemId: 'm1' });
    expect(completed[0]).toMatchObject({ kind: 'agentMessage', content: '画面是一只白猫。' });
    expect(missing[0]).toMatchObject({ kind: 'agentMessage', content: '画面是一只白猫。' });
  });

  it('replaces the reply when the completed event brings text', () => {
    const started = applyItemEvent([], { type: 'item/started', itemId: 'm1', kind: 'agentMessage' });
    const streamed = applyItemEvent(started, { type: 'item/agentMessage/delta', itemId: 'm1', delta: '草稿' });
    const completed = applyItemEvent(streamed, { type: 'item/agentMessage/completed', itemId: 'm1', content: '画面是一只白猫。' });
    expect(completed[0]).toMatchObject({ content: '画面是一只白猫。' });
  });

  it('keeps a declined tool distinct from a failed tool', () => {
    const started = applyItemEvent([], { type: 'item/started', itemId: 'tool-1', kind: 'toolCall' });
    const named = applyItemEvent(started, { type: 'item/toolCall/started', itemId: 'tool-1', name: 'deconstruct_image', displayName: '反推图片提示词', args: '{}' });
    const declined = applyItemEvent(named, { type: 'item/toolCall/completed', itemId: 'tool-1', name: 'deconstruct_image', displayName: '反推图片提示词', status: 'declined', summary: '用户拒绝了此操作' });
    expect(declined.find(item => item.kind === 'toolCall')).toMatchObject({ status: 'declined' });
    expect(declined.find(item => item.kind === 'toolResult')).toMatchObject({ status: 'declined', summary: '用户拒绝了此操作' });
  });
});
