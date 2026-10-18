import { describe, expect, it } from 'vitest';
import type { ChatSession, GenerationTask } from '@client/store/appStoreTypes';
import {
  pruneEmptySessions,
  resolveSessionsAfterDelete,
  deriveSessionTitleFromTasks,
  createBatchGenerationTasksPayload,
  collectSessionDeletion,
  omitDeletedGenerationTasks,
  mergeAndSortTasks,
  mergeRestoredSessions,
} from './generateSliceHelpers';

describe('generateSliceHelpers - session optimization', () => {
  it('pruneEmptySessions keeps at most one empty session', () => {
    const sessions: ChatSession[] = [
      { id: 's1', title: '新创作对话', createdAt: 1000, tasks: [] },
      { id: 's2', title: '新创作对话', createdAt: 2000, tasks: [] },
      { id: 's3', title: '赛博朋克城市', createdAt: 3000, tasks: [{ id: 't1' } as GenerationTask] },
      { id: 's4', title: '新创作对话', createdAt: 4000, tasks: [] },
    ];

    // 不指定 keepSessionId，只保留第 1 个空 session (s1) 以及有任务的 (s3)
    const pruned1 = pruneEmptySessions(sessions);
    expect(pruned1.map((s) => s.id)).toEqual(['s1', 's3']);

    // 指定 keepSessionId = s4，保留 s4 以及有任务的 s3
    const pruned2 = pruneEmptySessions(sessions, 's4');
    expect(pruned2.map((s) => s.id)).toEqual(['s3', 's4']);

    // 指定 keepSessionId = s3（有任务），保留第一个空 session s1 和 s3
    const pruned3 = pruneEmptySessions(sessions, 's3');
    expect(pruned3.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('deriveSessionTitleFromTasks derives title from task title or prompt', () => {
    expect(
      deriveSessionTitleFromTasks([
        { id: 't1', title: '未来科幻飞船在星际穿梭' } as GenerationTask,
      ]),
    ).toBe('未来科幻飞船在星际穿梭');

    expect(
      deriveSessionTitleFromTasks([
        { id: 't2', title: '', prompt: '一只可爱的小猫在阳光下打滚' } as GenerationTask,
      ]),
    ).toBe('一只可爱的小猫在阳光下打滚');

    expect(
      deriveSessionTitleFromTasks([
        { id: 't3', title: '新创作对话', prompt: '现代简约室内设计客厅' } as GenerationTask,
      ]),
    ).toBe('现代简约室内设计客厅');

    expect(deriveSessionTitleFromTasks([])).toBe('AI 创作对话');
  });

  it('createBatchGenerationTasksPayload reuses empty session and auto-updates title', () => {
    const emptySession: ChatSession = {
      id: 'session-empty',
      title: '新创作对话',
      createdAt: 1000,
      tasks: [],
    };
    const state = {
      sessions: [emptySession],
      currentSessionId: 'session-empty',
      generationTasks: [],
    };

    const task: Partial<GenerationTask> = {
      id: 'task-1',
      title: '古风唯美山水画',
      prompt: '烟雨江南水墨画',
    };

    const payload = createBatchGenerationTasksPayload([task], undefined, false, state);
    expect(payload.targetSessionId).toBe('session-empty');
    expect(payload.sessions.length).toBe(1);
    expect(payload.sessions[0].title).toBe('古风唯美山水画');
    expect(payload.sessions[0].tasks.length).toBe(1);
  });

  it('collects every task linked to a deleted session, including sessionId matches', () => {
    const sessions: ChatSession[] = [
      {
        id: 'keep',
        title: '保留',
        createdAt: 1,
        tasks: [{ id: 'keep-task', sessionId: 'keep' } as GenerationTask],
      },
      {
        id: 'drop',
        title: '删除',
        createdAt: 2,
        tasks: [{ id: 'in-session', taskId: 'remote-1', resultUrl: 'https://cdn.example/a.png' } as GenerationTask],
      },
    ];
    const generationTasks = [
      { id: 'in-session', sessionId: 'drop' } as GenerationTask,
      { id: 'orphan', sessionId: 'drop', taskId: 'remote-2', resultUrl: 'https://cdn.example/b.png' } as GenerationTask,
      { id: 'keep-task', sessionId: 'keep' } as GenerationTask,
    ];
    const removed = collectSessionDeletion(sessions, generationTasks, 'drop');
    expect(removed.ids).toEqual(expect.arrayContaining(['in-session', 'remote-1', 'orphan', 'remote-2']));
    expect(removed.urls).toEqual(expect.arrayContaining(['https://cdn.example/a.png', 'https://cdn.example/b.png']));
    const left = omitDeletedGenerationTasks(generationTasks, 'drop', removed.ids, removed.urls);
    expect(left.map((task) => task.id)).toEqual(['keep-task']);
  });

  it('resolveSessionsAfterDelete clears the list when the last session is removed', () => {
    const only = [{ id: 'last', title: '新创作对话', createdAt: 1, tasks: [] }];
    const cleared = resolveSessionsAfterDelete([], true, 'last');
    expect(cleared.sessions).toEqual([]);
    expect(cleared.currentSessionId).toBe('session-default');

    const kept = resolveSessionsAfterDelete(only, false, 'other');
    expect(kept.sessions.map((session) => session.id)).toEqual(['last']);
    expect(kept.currentSessionId).toBe('other');
  });

  it('keeps an on-screen agent reply when an empty record arrives', () => {
    const current = {
      id: 'agent-task-1',
      prompt: '反推',
      model: 'gpt-4o-mini',
      status: 'SUCCESS',
      createdAt: 10,
      agentTurn: {
        reply: '画面是一只白猫。',
        items: [{ id: 'm1', kind: 'agentMessage' as const, createdAt: 1, content: '画面是一只白猫。' }],
      },
    } as GenerationTask;
    const incoming = {
      ...current,
      agentTurn: { modelUsed: 'gpt-4o-mini', reply: '', items: [] },
    } as GenerationTask;
    const [merged] = mergeAndSortTasks([current], [incoming]);
    expect(merged.agentTurn?.reply).toBe('画面是一只白猫。');
    expect(merged.agentTurn?.items?.[0]?.kind).toBe('agentMessage');

    const sessions = mergeRestoredSessions(
      [{ id: 's1', title: '对话', createdAt: 1, tasks: [current] }],
      [{ id: 's1', title: '对话', createdAt: 1, tasks: [incoming] }],
    );
    expect(sessions[0].tasks[0].agentTurn?.reply).toBe('画面是一只白猫。');
  });

  it('marks and recognizes deleted session tombstones correctly', async () => {
    const { isSessionDeleted, markSessionDeleted } = await import('./persist/index');
    expect(isSessionDeleted('test-sess-123')).toBe(false);
    markSessionDeleted('test-sess-123');
    expect(isSessionDeleted('test-sess-123')).toBe(true);
  });
});
