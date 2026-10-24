import { describe, expect, it, vi } from 'vitest';
import { GENERATION_BATCH_LIMIT } from '@shared/domain/assistant/generationPrompts';
import { GenerationSubmissionQueue, getGenerationSubmissionLane, type GenerationSubmissionLane } from './generationSubmissionQueue';

function controlledJob(id: string, lane: GenerationSubmissionLane = 'media') {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  const run = vi.fn<(signal: AbortSignal) => Promise<void>>(() => promise);
  return { id, lane, run, resolve, reject };
}

async function flushQueue() {
  // Dispatch and the completion-triggered dispatch each use a microtask.
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('GenerationSubmissionQueue', () => {
  it('dispatches all media tasks in a batch concurrently by default and deduplicates pending/active IDs', async () => {
    const queue = new GenerationSubmissionQueue();
    const jobs = Array.from({ length: 5 }, (_, i) => controlledJob(`media-${i}`));
    queue.enqueue(jobs.slice(0, 4));
    queue.enqueue(jobs);
    await flushQueue();
    expect(jobs.map(job => job.run.mock.calls.length)).toEqual([1, 1, 1, 1, 1]);
    queue.enqueue(jobs);
    await flushQueue();
    expect(jobs.map(job => job.run.mock.calls.length)).toEqual([1, 1, 1, 1, 1]);
    jobs.forEach(job => job.resolve());
    await flushQueue();
  });

  it('dispatches independent Agent and conservative serial lanes without head-of-line blocking', async () => {
    const queue = new GenerationSubmissionQueue();
    queue.setMediaConcurrency(3);
    const media = Array.from({ length: 4 }, (_, i) => controlledJob(`media-${i}`));
    const agents = [controlledJob('agent-1', 'agent'), controlledJob('agent-2', 'agent')];
    const other = [controlledJob('depth', 'serial'), controlledJob('audio', 'serial')];
    queue.enqueue([...media, ...agents, ...other]);
    await flushQueue();
    expect(media.map(job => job.run.mock.calls.length)).toEqual([1, 1, 1, 0]);
    expect(agents.map(job => job.run.mock.calls.length)).toEqual([1, 0]);
    expect(other.map(job => job.run.mock.calls.length)).toEqual([1, 0]);
    agents[0].resolve();
    other[0].resolve();
    await flushQueue();
    expect(agents[1].run).toHaveBeenCalledOnce();
    expect(other[1].run).toHaveBeenCalledOnce();
    expect(media[3].run).not.toHaveBeenCalled();
    media[0].resolve();
    await flushQueue();
    expect(media[3].run).toHaveBeenCalledOnce();
    [...media, ...agents, ...other].forEach(job => job.resolve());
    await flushQueue();
  });

  it('raises capacity immediately and lowers it without aborting existing requests', async () => {
    const queue = new GenerationSubmissionQueue();
    queue.setMediaConcurrency(1);
    const jobs = Array.from({ length: 7 }, (_, i) => controlledJob(`${i}`));
    queue.enqueue(jobs);
    await flushQueue();
    expect(jobs.filter(job => job.run.mock.calls.length)).toHaveLength(1);
    queue.setMediaConcurrency(6);
    await flushQueue();
    expect(jobs.filter(job => job.run.mock.calls.length)).toHaveLength(6);
    queue.setMediaConcurrency(2);
    for (let i = 0; i < 4; i += 1) jobs[i].resolve();
    await flushQueue();
    expect(jobs[6].run).not.toHaveBeenCalled();
    expect(jobs[4].run.mock.calls[0][0].aborted).toBe(false);
    expect(jobs[5].run.mock.calls[0][0].aborted).toBe(false);
    jobs[4].resolve();
    await flushQueue();
    expect(jobs[6].run).toHaveBeenCalledOnce();
    jobs.forEach(job => job.resolve());
    await flushQueue();
  });

  it.each([
    [0, 1],
    [99, GENERATION_BATCH_LIMIT],
    [2.9, 2],
    [Number.NaN, GENERATION_BATCH_LIMIT],
    [Infinity, GENERATION_BATCH_LIMIT],
  ])(
    'normalizes media capacity %s to %s', (input, expected) => {
      const queue = new GenerationSubmissionQueue();
      expect(queue.setMediaConcurrency(input)).toBe(expected);
      expect(queue.getMediaConcurrency()).toBe(expected);
    },
  );

  it('cancels every active controller and holds slots and IDs until original requests settle', async () => {
    const queue = new GenerationSubmissionQueue();
    queue.setMediaConcurrency(1);
    const media = controlledJob('media');
    const agent = controlledJob('agent', 'agent');
    const serial = controlledJob('depth', 'serial');
    const removed = controlledJob('pending');
    queue.enqueue([media, agent, serial, removed]);
    await flushQueue();
    const signals = [media, agent, serial].map(job => job.run.mock.calls[0][0]);
    expect(new Set(signals).size).toBe(3);
    queue.cancel();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    const remounted = controlledJob('media');
    const next = controlledJob('new-media');
    const nextAgent = controlledJob('new-agent', 'agent');
    const nextSerial = controlledJob('audio', 'serial');
    queue.enqueue([remounted, next, nextAgent, nextSerial]);
    await flushQueue();
    expect(remounted.run).not.toHaveBeenCalled();
    expect(next.run).not.toHaveBeenCalled();
    expect(nextAgent.run).not.toHaveBeenCalled();
    expect(nextSerial.run).not.toHaveBeenCalled();
    media.resolve();
    await flushQueue();
    expect(next.run).toHaveBeenCalledOnce();
    expect(nextAgent.run).not.toHaveBeenCalled();
    expect(removed.run).not.toHaveBeenCalled();
    agent.resolve();
    serial.resolve();
    await flushQueue();
    expect(nextAgent.run).toHaveBeenCalledOnce();
    expect(nextSerial.run).toHaveBeenCalledOnce();
    expect(remounted.run).not.toHaveBeenCalled();
    [next, nextAgent, nextSerial].forEach(job => job.resolve());
    await flushQueue();
  });

  it('cancels a pre-dispatch mount and only runs the remounted batch once', async () => {
    const queue = new GenerationSubmissionQueue();
    const abandoned = controlledJob('same-id');
    const remounted = controlledJob('same-id');
    queue.enqueue([abandoned]);
    queue.cancel();
    queue.enqueue([remounted]);
    queue.enqueue([remounted]);
    await flushQueue();
    expect(abandoned.run).not.toHaveBeenCalled();
    expect(remounted.run).toHaveBeenCalledOnce();
    remounted.resolve();
    await flushQueue();
  });

  it('retains only listed tasks, aborting removed active work without releasing its slot early', async () => {
    const queue = new GenerationSubmissionQueue();
    queue.setMediaConcurrency(1);
    const deleted = controlledJob('deleted-active');
    const deletedPending = controlledJob('deleted-pending');
    const kept = controlledJob('kept-pending');
    const agent = controlledJob('kept-agent', 'agent');
    queue.enqueue([deleted, deletedPending, kept, agent]);
    await flushQueue();
    queue.retain(new Set([kept.id, agent.id]));
    expect(deleted.run.mock.calls[0][0].aborted).toBe(true);
    expect(agent.run.mock.calls[0][0].aborted).toBe(false);
    await flushQueue();
    expect(kept.run).not.toHaveBeenCalled();
    deleted.resolve();
    await flushQueue();
    expect(deletedPending.run).not.toHaveBeenCalled();
    expect(kept.run).toHaveBeenCalledOnce();
    kept.resolve();
    agent.resolve();
    await flushQueue();
  });

  it('deduplicates IDs across lanes but allows an explicit retry after settlement', async () => {
    const queue = new GenerationSubmissionQueue();
    const first = controlledJob('same-id', 'agent');
    const duplicate = controlledJob('same-id', 'media');
    queue.enqueue([first]);
    await flushQueue();
    queue.enqueue([duplicate]);
    await flushQueue();
    expect(duplicate.run).not.toHaveBeenCalled();
    first.resolve();
    await flushQueue();
    queue.enqueue([duplicate]);
    await flushQueue();
    expect(duplicate.run).toHaveBeenCalledOnce();
    duplicate.resolve();
    await flushQueue();
  });

  it('releases rejected and synchronously throwing jobs without stalling their lane', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const queue = new GenerationSubmissionQueue();
      queue.setMediaConcurrency(1);
      const first = controlledJob('rejected');
      const next = controlledJob('next');
      queue.enqueue([first, {
        id: 'throwing', lane: 'media', run: () => { throw new Error('sync'); },
      }, next]);
      await flushQueue();
      first.reject(new Error('async'));
      await flushQueue();
      expect(next.run).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledTimes(2);
      next.resolve();
      await flushQueue();
    } finally {
      warn.mockRestore();
    }
  });
});

describe('getGenerationSubmissionLane', () => {
  it.each([
    [undefined, 'media'], ['image', 'media'], ['video', 'media'], ['agent', 'agent'],
    ['audio', 'serial'], ['depth-image', 'serial'], ['depth-video', 'serial'], ['future-type', 'serial'],
  ])('classifies %s as %s', (mediaType, lane) => {
    expect(getGenerationSubmissionLane(mediaType)).toBe(lane);
  });
});
