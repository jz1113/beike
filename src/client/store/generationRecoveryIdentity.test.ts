import { describe, expect, it } from 'vitest';
import type { ChatSession, GenerationTask } from './appStoreTypes';
import { mergeAndSortTasks, mergeRestoredSessions, syncTasksWithDatabase } from './generateSliceHelpers';

function task(id: string, overrides: Partial<GenerationTask> = {}): GenerationTask {
  return { id, title: id, prompt: id, model: 'gpt-image-2', size: '1024x1024', quality: 'high', progress: '15%',
    status: 'IN_PROGRESS', useReferenceImage: false, createdAt: 1, mediaType: 'image', taskId: 'same-provider-id',
    usageScope: { workspaceId: 'workspace', channelId: 'channel-a', mediaType: 'image' }, ...overrides };
}
const session = (tasks: GenerationTask[]): ChatSession => ({ id: 'session', title: '恢复', createdAt: 1, tasks });
const done = (t: GenerationTask): GenerationTask => ({ ...t, status: 'SUCCESS', progress: '100%', resultUrl: `/${t.dbId || t.id}.png` });

describe('P1 recovery identity isolation', () => {
  it.each(['record', 'channel', 'workspace', 'media'] as const)('keeps same-number tasks isolated by %s across archive and session recovery', field => {
    const a = task('local-a', { dbId: 'record-a' });
    const b = task('local-b', { dbId: 'record-b',
      ...(field === 'channel' ? { usageScope: { ...a.usageScope!, channelId: 'channel-b' } } : {}),
      ...(field === 'workspace' ? { usageScope: { ...a.usageScope!, workspaceId: 'other' } } : {}),
      ...(field === 'media' ? { mediaType: 'video', usageScope: { ...a.usageScope!, mediaType: 'video' } } : {}),
    });
    const restored = mergeAndSortTasks([], [a, b]);
    expect(restored).toHaveLength(2);
    const next = mergeAndSortTasks(restored, [done(b), done(a)]);
    expect(next.find(t => t.id === a.id)).toMatchObject({ dbId: 'record-a', resultUrl: '/record-a.png', usageScope: a.usageScope });
    expect(next.find(t => t.id === b.id)).toMatchObject({ dbId: 'record-b', resultUrl: '/record-b.png', usageScope: b.usageScope });
    const sessions = mergeRestoredSessions([session([a])], [session([done(b)])]);
    expect(sessions[0].tasks).toHaveLength(2);
    expect(sessions[0].tasks.find(t => t.id === a.id)).toMatchObject({ dbId: 'record-a', status: 'IN_PROGRESS' });
  });

  it('does not merge conflicting channels or media even when neither record number was received', () => {
    const a = task('a');
    const b = task('b', { usageScope: { ...a.usageScope!, channelId: 'b' } });
    const video = task('v', { mediaType: 'video', usageScope: { ...a.usageScope!, mediaType: 'video' } });
    expect(mergeAndSortTasks([], [a, b, video])).toHaveLength(3);
  });

  it('prefers immutable record identity over a coincidental provider number and updates the correct session', () => {
    const a = task('local-a', { dbId: 'record-a' });
    const b = task('local-b', { dbId: 'record-b', usageScope: { ...a.usageScope!, channelId: 'b' } });
    const remoteA = done({ ...a, id: 'record-a', dbId: undefined, usageScope: undefined });
    const remoteB = done({ ...b, id: 'record-b', dbId: undefined, usageScope: undefined });
    const synced = syncTasksWithDatabase([a, b], [session([a, b])], [remoteB, remoteA]);
    expect(synced.generationTasks).toHaveLength(2);
    for (const rows of [synced.generationTasks, synced.sessions[0].tasks]) {
      expect(rows.find(t => t.id === a.id)).toMatchObject({ dbId: 'record-a', resultUrl: '/record-a.png', usageScope: a.usageScope });
      expect(rows.find(t => t.id === b.id)).toMatchObject({ dbId: 'record-b', resultUrl: '/record-b.png', usageScope: b.usageScope });
    }
  });

  it('merges aliases of one original record even if the upstream number has changed', () => {
    const a = task('local', { dbId: 'record' });
    const b = done(task('history', { dbId: 'record', taskId: 'accepted-final-id' }));
    expect(mergeAndSortTasks([a], [b])).toHaveLength(1);
    expect(mergeAndSortTasks([a], [b])[0]).toMatchObject({ id: 'local', dbId: 'record', taskId: 'accepted-final-id' });
  });

  it('does not guess among missing-scope historical tasks using their shared provider number', () => {
    const a = task('a', { usageScope: undefined });
    const b = task('b', { usageScope: undefined });
    expect(mergeAndSortTasks([], [a, b])).toHaveLength(2);
    expect(mergeRestoredSessions([session([a])], [session([b])])[0].tasks).toHaveLength(2);
  });

  it('allows a unique provider alias only with a matching original scope and no conflicting record', () => {
    const a = task('a');
    const b = done(task('history', { dbId: 'record' }));
    expect(mergeAndSortTasks([a], [b])).toHaveLength(1);
    const other = task('other', { dbId: 'other-record' });
    expect(mergeAndSortTasks([other], [b])).toHaveLength(2);
  });

  it('does not hide an existing task if only its provider number occurs in an incoming session', () => {
    const a = task('a', { dbId: 'record-a' });
    const b = task('b', { dbId: 'record-b' });
    expect(mergeRestoredSessions([session([a, b])], [session([done(b)])])[0].tasks).toHaveLength(2);
  });

  it('does not overwrite a conflicting strong identity just because the local ID matches', () => {
    const a = task('local', { dbId: 'record-a' });
    const b = task('local', { dbId: 'record-b' });
    expect(mergeAndSortTasks([a], [b])).toHaveLength(2);
  });
});

it.each(['channel', 'workspace', 'media'] as const)('P1 treats an explicit %s conflict as incompatible even with an equal record number', field => {
  const a = task('local', { dbId: 'record' });
  const scope = { ...a.usageScope!, ...(field === 'channel' ? { channelId: 'other' } : field === 'workspace' ? { workspaceId: 'other' } : { mediaType: 'video' }) };
  const b = task('history', { dbId: 'record', usageScope: scope, ...(field === 'media' ? { mediaType: 'video' } : {}) });
  expect(mergeAndSortTasks([a], [b])).toHaveLength(2);
});

it('P1 does not select an arbitrary provider alias when more than one scoped original exists', () => {
  const a = task('a', { dbId: 'record-a' });
  const b = task('b', { dbId: 'record-b' });
  const legacy = task('legacy');
  expect(mergeAndSortTasks([a, b], [legacy])).toHaveLength(3);
});

it('P1 keeps original scope when a session record omits it and joins aliases by record number', () => {
  const a = task('local', { dbId: 'record' });
  const b = done(task('history', { dbId: 'record', usageScope: undefined }));
  const rows = mergeRestoredSessions([session([a])], [session([b])])[0].tasks;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: 'local', dbId: 'record', usageScope: a.usageScope, status: 'SUCCESS' });
});

it('P1 recognizes saved audio scope when a historical alias omits its mediaType field', () => {
  const scope = { workspaceId: 'w', channelId: 'a', mediaType: 'audio' };
  const a = task('audio-local', { mediaType: 'audio', model: 'speech-2.8-hd', dbId: 'audio-record', usageScope: scope });
  const b = task('audio-history', { mediaType: undefined, model: 'speech-2.8-hd', dbId: 'audio-record', usageScope: scope });
  expect(mergeAndSortTasks([a], [b])).toHaveLength(1);
});

it('P1 retains receipt and channel metadata when an archive snapshot explicitly omits fields', () => {
  const a = task('local', { dbId: 'record', modelRouteKey: 'original-route', mediaType: 'audio', model: 'speech-2.8-hd',
    usageScope: { workspaceId: 'w', channelId: 'a', mediaType: 'audio' } });
  const b = { ...a, dbId: undefined, taskId: undefined, mediaType: undefined, modelRouteKey: undefined };
  for (const rows of [mergeAndSortTasks([a], [b]), mergeRestoredSessions([session([a])], [session([b])])[0].tasks]) {
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: a.id, dbId: 'record', taskId: a.taskId, modelRouteKey: 'original-route', mediaType: 'audio', usageScope: a.usageScope });
  }
});

it('P1 preserves legacy Agent identity when its accounting scope is chat', () => {
  const scope = { workspaceId: 'w', channelId: 'a', mediaType: 'chat' };
  const a = task('agent-task-original', { mediaType: 'agent', usageScope: scope });
  const b = { ...a, mediaType: undefined };
  expect(mergeAndSortTasks([a], [b])).toHaveLength(1);
});
