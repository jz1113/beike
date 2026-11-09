import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssistantItem } from '@shared/domain/assistant/types';
import { normalizeAssistantItems } from '@shared/domain/assistant/normalizeAssistantItems';
import { normalizeAssistantSessions } from '@client/store/persist/assistantValidation';
import { clearUsageLogs, getUsageLogs } from '@client/shared/utils/usageTracker';
import {
  activityEntries,
  activityStateLabel,
  answerVerdicts,
  executionFailed,
  executionSettledLabel,
  prepareAssistantUsage,
  recordAssistantChatUsage,
  snapshotAssistantSkill,
} from './assistantActivity';

const scope = { workspaceId: 'original-workspace', channelId: 'original-channel', mediaType: 'chat' };
afterEach(() => vi.unstubAllGlobals());

describe('assistant skill snapshot and usage', () => {
  it('preserves the sent version and resource text through package edits and history restoration', () => {
    const skill = {
      id: 'custom',
      name: '测试',
      description: '用途',
      prompt: '旧主指令',
      libraryVersion: 'v1',
      tools: ['read_document'],
      files: [{ path: 'references/example.md', content: '旧资料' }],
    };
    const usedSkill = snapshotAssistantSkill(skill);
    skill.prompt = '新主指令';
    skill.files[0].content = '新资料';
    skill.libraryVersion = 'v2';
    const [session] = normalizeAssistantSessions([{ id: 'session', messages: [{ id: 'message', role: 'user', content: '需求', timestamp: 1, usedSkill }] }]);
    const restored = session.messages[0].usedSkill;
    expect(restored?.libraryVersion).toBe('v1');
    expect(restored?.systemPrompt).toContain('旧主指令');
    expect(restored?.systemPrompt).not.toContain('新主指令');
    expect(restored?.resources?.[0].content).toBe('旧资料');
    expect(restored?.allowedTools).toContain('read_document');
  });

  it('deduplicates live and recovered chat usage by original turn and channel', () => {
    const values = new Map<string, string>([['ai_assistant_turn_usage:turn-a', JSON.stringify({ scope, modelId: 'gpt-6-luna' })]]);
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size;
      },
      key: (i: number) => [...values.keys()][i] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    recordAssistantChatUsage('gpt-6-luna', { prompt_tokens: 5 }, 'turn-a');
    values.set('beike_workspace_secret', 'another-workspace');
    recordAssistantChatUsage('gpt-6-luna', { inputTokens: 5, outputTokens: 7 }, 'turn-a');
    recordAssistantChatUsage('gpt-6-luna', { inputTokens: 2, outputTokens: 1 }, 'turn-a');
    expect(getUsageLogs()).toHaveLength(1);
    expect(getUsageLogs()[0]).toMatchObject({ scope, taskId: 'text:assistant:turn-a', totalTokens: 12 });
  });

  it('does not invent channel attribution for old turns without a saved scope', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    recordAssistantChatUsage('gpt-6-luna', { total_tokens: 99 }, 'legacy-turn');
    expect(getUsageLogs()).toHaveLength(0);
  });

  it('P2 replay of a saved pre-clear turn cannot resurrect cleared usage', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size;
      },
      key: (i: number) => [...values.keys()][i] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    });
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    prepareAssistantUsage('old-turn', { model: 'gpt-6-luna' });
    recordAssistantChatUsage('gpt-6-luna', { totalTokens: 7 }, 'old-turn');
    clearUsageLogs();
    recordAssistantChatUsage('gpt-6-luna', { totalTokens: 12 }, 'old-turn');
    expect(getUsageLogs()).toEqual([]);
    prepareAssistantUsage('new-turn', { model: 'gpt-6-luna' });
    recordAssistantChatUsage('gpt-6-luna', { totalTokens: 3 }, 'new-turn');
    expect(getUsageLogs()).toHaveLength(1);
    expect(getUsageLogs()[0].totalTokens).toBe(3);
  });
});

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
