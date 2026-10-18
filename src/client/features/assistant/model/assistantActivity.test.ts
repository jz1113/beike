import { describe, expect, it } from 'vitest';
import type { AssistantItem } from '@shared/domain/assistant/types';
import { normalizeAssistantItems } from '@shared/domain/assistant/normalizeAssistantItems';
import { activityEntries, activityStateLabel, answerVerdicts, executionFailed, executionSettledLabel } from './assistantActivity';

const declinedTurn: AssistantItem[] = [
  { id: 'tool-1', kind: 'toolCall', createdAt: 1, name: 'deconstruct_image', displayName: '反推图片提示词', args: '{}', callId: 'call-1', status: 'declined', summary: '用户拒绝了此操作' },
  { id: 'tool-1__result', kind: 'toolResult', createdAt: 2, name: 'deconstruct_image', displayName: '反推图片提示词', status: 'declined', summary: '用户拒绝了此操作' },
  { id: 'reply-1', kind: 'agentMessage', createdAt: 3, content: '主体：一名年轻男性' },
];

describe('assistant step outcome', () => {
  it('keeps a declined step out of the failure state and explains the later answer', () => {
    const entries = activityEntries(declinedTurn, false);
    expect(entries[0]?.status).toBe('declined');
    expect(activityStateLabel('declined')).toBe('已拒绝');
    expect(executionFailed(entries)).toBe(false);
    expect(executionSettledLabel(entries)).toBe('已跳过');
    expect(answerVerdicts(declinedTurn)).toEqual(['未执行反推图片提示词。下面是直接回答，不是该工具的结果。']);
    expect(answerVerdicts(declinedTurn.filter(item => item.kind !== 'agentMessage'))).toEqual([]);
  });

  it('keeps a real tool error as failure', () => {
    const items: AssistantItem[] = [
      { id: 'tool-1', kind: 'toolCall', createdAt: 1, name: 'deconstruct_image', displayName: '反推图片提示词', args: '{}', callId: 'call-1', status: 'error' },
      { id: 'tool-1__result', kind: 'toolResult', createdAt: 2, name: 'deconstruct_image', displayName: '反推图片提示词', status: 'error', summary: '上游超时' },
      { id: 'reply-1', kind: 'agentMessage', createdAt: 3, content: '暂时无法完成。' },
    ];
    const entries = activityEntries(items, false);
    expect(activityStateLabel(entries[0]!.status)).toBe('失败');
    expect(executionFailed(entries)).toBe(true);
    expect(executionSettledLabel(entries)).toBe('有步骤失败');
    expect(answerVerdicts(items)).toEqual(['反推图片提示词没有完成。下面的内容不能当作该步骤已成功。']);
  });

  it('restores declined after refresh instead of turning it into failure', () => {
    const [call, result] = normalizeAssistantItems(declinedTurn);
    expect(call).toMatchObject({ kind: 'toolCall', status: 'declined' });
    expect(result).toMatchObject({ kind: 'toolResult', status: 'declined' });
  });
});
