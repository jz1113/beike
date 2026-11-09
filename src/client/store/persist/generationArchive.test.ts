import { afterEach, expect, it, vi } from 'vitest';
import type { GenerationTask } from '../appStoreTypes';
import {
  mergeDrawingSnapshots,
  readDrawingArchive,
  restoreArchivedMedia,
  type DrawingSnapshot,
} from './generationArchive';
import {
  generationDeletedKeys,
  getStoredDrawingSessions,
  sanitizeTaskForStorage,
} from './generation';
import { prepareGenerationAttempt } from '@client/shared/media/generationAttempt';

const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('idb', () => ({ openDB: mocks.open }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('restores both explicit frame slots before creating a fresh retry after reload', async () => {
  vi.stubGlobal('indexedDB', {});
  const task = {
    id: 'original',
    prompt: '转身',
    model: 'video-model',
    status: 'FAILURE',
    videoRefMode: 'first_last_frame',
    referenceImages: ['blob:old-first', 'blob:old-last'],
    firstFrameImage: 'blob:old-first',
    lastFrameImage: 'blob:old-last',
    useReferenceImage: true,
  } as GenerationTask;
  const snapshot = { tasks: [task], sessions: [], currentId: 'chat', updatedAt: 1 };
  mocks.open.mockResolvedValue({
    get: async () => ({
      snapshot,
      files: [
        ['blob:old-first', new File(['first'], 'first.png')],
        ['blob:old-last', new File(['last'], 'last.png')],
      ],
    }),
    close: vi.fn(),
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:restored-first').mockReturnValueOnce('blob:restored-last');
  const restored = await readDrawingArchive(0);
  const attempt = await prepareGenerationAttempt(restored!.tasks[0], 'retry-batch');
  expect(attempt).toMatchObject({
    referenceImages: ['blob:restored-first', 'blob:restored-last'],
    firstFrameImage: 'blob:restored-first',
    lastFrameImage: 'blob:restored-last',
  });
  expect(attempt!.id).not.toBe(task.id);
  const light = sanitizeTaskForStorage(task);
  expect(light).toMatchObject({ firstFrameImage: undefined, lastFrameImage: undefined });
  expect(restoreArchivedMedia({ ...snapshot, tasks: [light] }, restored!).tasks[0]).toMatchObject({
    firstFrameImage: 'blob:restored-first',
    lastFrameImage: 'blob:restored-last',
  });
  const olderLight = { ...light, firstFrameImage: 'blob:old-first', lastFrameImage: 'blob:old-last' };
  expect(restoreArchivedMedia({ ...snapshot, tasks: [olderLight] }, restored!).tasks[0]).toMatchObject({
    firstFrameImage: 'blob:restored-first',
    lastFrameImage: 'blob:restored-last',
  });
  expect(task.referenceImages).toEqual(['blob:old-first', 'blob:old-last']);
});

const agentTask: GenerationTask = {
  id: 'agent-task-restored',
  sessionId: 'chat',
  taskId: 'turn',
  mediaType: 'agent',
  title: '对话',
  prompt: '问题',
  model: 'gpt-6-luna',
  size: '-',
  quality: 'high',
  status: 'IN_PROGRESS',
  progress: '15%',
  useReferenceImage: false,
  agentTurn: { turnId: 'turn', threadId: 'chat' },
};

function restoreSessionTask(value: GenerationTask) {
  generationDeletedKeys.clear();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string) =>
      key === 'drawing_history_v2'
        ? JSON.stringify({
            tasks: [value],
            sessions: [{ id: 'chat', title: '对话', createdAt: 1, tasks: [value] }],
            currentId: 'chat',
            updatedAt: 1,
          })
        : null,
  });
  return getStoredDrawingSessions();
}

it('restores an accepted Agent operation for receipt queries instead of declaring it failed', () => {
  const restored = restoreSessionTask(agentTask);
  expect(restored.tasks[0]).toMatchObject({ taskId: 'turn', status: 'IN_PROGRESS', submissionRecoveryRequired: true });
  expect(restored.sessions[0].tasks[0]).toMatchObject({ taskId: 'turn', status: 'IN_PROGRESS', submissionRecoveryRequired: true });
});

it('keeps an unsubmitted conversation retryable and leaves completed replies intact', () => {
  expect(restoreSessionTask({ ...agentTask, taskId: undefined, agentTurn: undefined }).tasks[0]).toMatchObject({
    status: 'FAILURE',
    submissionRecoveryRequired: false,
  });
  expect(restoreSessionTask({ ...agentTask, status: 'SUCCESS', agentTurn: { ...agentTask.agentTurn, reply: '已经完成' } }).tasks[0]).toMatchObject({
    status: 'SUCCESS',
    agentTurn: { reply: '已经完成' },
  });
});

it('reloads an unlinked canvas submission as receipt-only and retains its audio inputs', () => {
  const media: GenerationTask = {
    ...agentTask,
    id: 'studio-audio-reference',
    canvasProjectId: 'canvas-1',
    mediaType: 'video',
    taskId: undefined,
    agentTurn: undefined,
    model: 'MiniMax-H3',
    modelRouteKey: 'comfly-h3',
    referenceAudioUrls: ['/storage/local/audio/original.wav'],
  };
  const restored = restoreSessionTask(media);
  for (const row of [restored.tasks[0], restored.sessions[0].tasks[0]]) {
    expect(row).toMatchObject({
      id: media.id,
      status: 'IN_PROGRESS',
      submissionRecoveryRequired: true,
      modelRouteKey: 'comfly-h3',
      referenceAudioUrls: media.referenceAudioUrls,
    });
  }
});

const mergeBaseTask: GenerationTask = {
  id: 'original',
  title: '原任务',
  size: '1:1',
  quality: 'standard',
  useReferenceImage: false,
  model: 'image-route',
  prompt: '保留原任务',
  createdAt: 1,
  status: 'IN_PROGRESS',
  progress: '15%',
  taskId: 'upstream-original',
};

function makeSnapshot(value: GenerationTask): DrawingSnapshot {
  return {
    tasks: [value],
    sessions: [{ id: 'session', title: '保留会话', createdAt: 1, tasks: [value] }],
    currentId: 'session',
    updatedAt: 1,
  };
}

it('does not restore late progress or query errors over a result completed in another tab', () => {
  const base = makeSnapshot(mergeBaseTask);
  const local = makeSnapshot({ ...mergeBaseTask, progress: '97%', failReason: '查询暂时不可用', submissionRecoveryRequired: true });
  const remote = makeSnapshot({ ...mergeBaseTask, status: 'SUCCESS', progress: '100%', resultUrl: '/storage/original.png', submissionRecoveryRequired: false });
  const merged = mergeDrawingSnapshots(base, local, remote);
  for (const value of [merged.tasks[0], merged.sessions[0].tasks[0]]) {
    expect(value).toMatchObject({
      status: 'SUCCESS',
      resultUrl: '/storage/original.png',
      progress: '100%',
      failReason: undefined,
      submissionRecoveryRequired: false,
      taskId: mergeBaseTask.taskId,
    });
  }
  expect(remote.tasks[0].progress).toBe('100%');
});

it('keeps local successful results and additional edits when merging an already completed task', () => {
  const base = makeSnapshot(mergeBaseTask);
  const local = makeSnapshot({ ...mergeBaseTask, status: 'SUCCESS', resultUrl: '/storage/new-result.png', progress: '100%', prompt: '补充备注' });
  const remote = makeSnapshot({ ...mergeBaseTask, status: 'SUCCESS', resultUrl: '/storage/original.png', progress: '100%' });
  expect(mergeDrawingSnapshots(base, local, remote).tasks[0]).toMatchObject({
    resultUrl: '/storage/new-result.png',
    prompt: '补充备注',
    status: 'SUCCESS',
  });
});


it('does not resume an interrupted direct collection as an agent turn', () => {
  expect(restoreSessionTask({ ...agentTask, model: 'direct-collection' }).tasks[0]).toMatchObject({
    status: 'FAILURE', submissionRecoveryRequired: false, failReason: expect.stringContaining('采集连接已中断'),
  });
});
