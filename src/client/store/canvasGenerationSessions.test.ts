import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createGenerateSlice } from './generateSlice';
import type { AppState } from './types';
import type { GenerationTask } from './appStoreTypes';

const persist = vi.hoisted(() => vi.fn());
vi.mock('./persist/index', () => ({
  getStoredDrawingSessions: () => ({ sessions: [], tasks: [], currentId: 'session-default' }),
  isDrawingHistoryReady: () => true, persistDrawingStateToStorage: persist,
  markGenerationDeleted: vi.fn(), markSessionDeleted: vi.fn(),
}));

function task(id: string, projectId?: string): GenerationTask {
  return { id, title: id, prompt: id, model: 'test', size: '-', quality: 'high',
    status: 'IN_PROGRESS', progress: '0%', useReferenceImage: false,
    ...(projectId ? { canvasProjectId: projectId, sessionTitle: '画布项目' } : {}),
  } as GenerationTask;
}

function fixture() {
  const store = createStore<AppState>()((set, get, api) => ({ ...createGenerateSlice(set, get, api) } as AppState));
  store.setState({ sessions: [{ id: 'chat', title: '普通对话', createdAt: 1, tasks: [task('chat-task')] }], currentSessionId: 'chat' });
  return store;
}

describe('canvas generation session ownership', () => {
  beforeEach(() => persist.mockClear());

  it('queues a canvas task without appending to or selecting the ordinary conversation', () => {
    const store = fixture();
    store.getState().addGenerationTask(task('canvas-task', 'project-a'));
    expect(store.getState().currentSessionId).toBe('chat');
    expect(store.getState().sessions.find(s => s.id === 'chat')?.tasks.map(t => t.id)).toEqual(['chat-task']);
    const canvas = store.getState().sessions.find(s => s.tasks.some(t => t.id === 'canvas-task'));
    expect(canvas).toMatchObject({ canvasProjectId: 'project-a' });
    expect(canvas?.id).not.toBe('chat');
    expect(store.getState().generationTasks[0].sessionId).toBe(canvas?.id);
  });

  it('keeps each canvas project separate and resumes the same project conversation', () => {
    const store = fixture();
    store.getState().addGenerationTask(task('a1', 'project-a'));
    store.getState().addGenerationTask(task('b1', 'project-b'));
    store.getState().addBatchGenerationTasks([task('a2', 'project-a'), task('a3', 'project-a')], '批量', true);
    expect(store.getState().sessions).toHaveLength(3);
    const session = store.getState().sessions.find(s => s.tasks.some(t => t.id === 'a1'));
    expect(session?.tasks.map(t => t.id)).toEqual(['a2', 'a3', 'a1']);
    expect(new Set(session?.tasks.map(t => t.sessionId))).toEqual(new Set([session?.id]));
    expect(store.getState().currentSessionId).toBe('chat');
    expect(store.getState().generationTasks).toHaveLength(4);
  });

  it('rebinds a retried canvas task that still carries the former ordinary session ID', () => {
    const store = fixture();
    store.getState().addGenerationTask({ ...task('retry', 'project-a'), sessionId: 'chat' });
    expect(store.getState().generationTasks[0].sessionId).not.toBe('chat');
    expect(store.getState().sessions.find(s => s.id === 'chat')?.tasks).toHaveLength(1);
  });

  it.each([false, true])('moves a restored canvas task out of its former conversation before deletion (batch: %s)', batch => {
    const store = fixture();
    const original = { ...task('restored'), sessionId: 'chat' };
    const chat = store.getState().sessions[0];
    store.setState({ sessions: [{ ...chat, tasks: [original, ...chat.tasks] }], generationTasks: [original] });
    const recovered = { ...original, canvasProjectId: 'project-a' };
    if (batch) store.getState().addBatchGenerationTasks([recovered]);
    else store.getState().addGenerationTask(recovered);

    expect(store.getState().sessions.find(session => session.id === 'chat')?.tasks.map(task => task.id)).toEqual(['chat-task']);
    expect(original.sessionId).toBe('chat');
    expect(chat.tasks.map(task => task.id)).toEqual(['chat-task']);
    store.getState().deleteSession('chat');
    expect(store.getState().generationTasks).toEqual([expect.objectContaining({ id: 'restored', canvasProjectId: 'project-a', sessionId: 'canvas-session:project-a' })]);
    expect(store.getState().sessions[0].tasks.map(task => task.id)).toEqual(['restored']);
  });

  it('removes an older local alias of the same upstream task from the former conversation', () => {
    const store = fixture();
    const original = { ...task('legacy-local'), sessionId: 'chat', taskId: 'upstream-task' };
    const chat = store.getState().sessions[0];
    store.setState({ sessions: [{ ...chat, tasks: [original, ...chat.tasks] }], generationTasks: [original] });
    store.getState().addGenerationTask({ ...original, id: 'restored-local', canvasProjectId: 'project-a' });

    store.getState().deleteSession('chat');
    expect(store.getState().generationTasks.map(task => task.id)).toEqual(['restored-local']);
    expect(store.getState().sessions[0].tasks).toEqual([expect.objectContaining({ id: 'restored-local', taskId: 'upstream-task' })]);
  });

  it('continues ordinary conversation submissions after canvas generation', () => {
    const store = fixture();
    store.getState().addBatchGenerationTasks([task('canvas', 'project-a')]);
    store.getState().addGenerationTask(task('ordinary'));
    expect(store.getState().currentSessionId).toBe('chat');
    expect(store.getState().sessions.find(s => s.id === 'chat')?.tasks.map(t => t.id)).toEqual(['ordinary', 'chat-task']);
  });

  it('does not select a hidden canvas session when deleting the ordinary conversation', () => {
    const store = fixture();
    store.getState().addGenerationTask(task('canvas', 'project-a'));
    store.getState().deleteSession('chat');
    expect(store.getState().currentSessionId).toBe('session-default');
    store.getState().addGenerationTask(task('ordinary'));
    const selected = store.getState().sessions.find(s => s.id === store.getState().currentSessionId);
    expect(selected?.canvasProjectId).toBeUndefined();
    expect(selected?.tasks.map(t => t.id)).toEqual(['ordinary']);
    expect(store.getState().sessions.find(s => s.canvasProjectId)?.tasks.map(t => t.id)).toEqual(['canvas']);
  });
});

it('keeps successful canvas results terminal when an older poll only patches progress or recovery hints',()=>{
 const store=fixture();
 store.getState().addGenerationTask(task('canvas-completed','project-a'));
 store.getState().updateGenerationTask('canvas-completed',{status:'SUCCESS',progress:'100%',resultUrl:'/storage/completed.png'});
 store.getState().updateGenerationTask('canvas-completed',{progress:'97%',failReason:'查询暂不可用',submissionRecoveryRequired:true},{persist:false});
 const state=store.getState();
 for(const value of [state.generationTasks.find(t=>t.id==='canvas-completed'),state.sessions.flatMap(s=>s.tasks).find(t=>t.id==='canvas-completed')])
  expect(value).toMatchObject({status:'SUCCESS',resultUrl:'/storage/completed.png',progress:'100%',failReason:undefined,submissionRecoveryRequired:false});
});
