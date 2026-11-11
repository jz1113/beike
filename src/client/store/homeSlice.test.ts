import { expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { AppState } from './types';
import { createHomeSlice } from './homeSlice';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};

it('ignores reads from a replaced draft while accounting for concurrent current uploads', async () => {
  const store = createStore(createHomeSlice as unknown as import('zustand').StateCreator<AppState>);
  const old = deferred(), current = deferred(), other = deferred();
  const read = (wait: ReturnType<typeof deferred>, url: string) => store.getState().readPromptAttachments(async isCurrent => {
    await wait.promise;
    if (isCurrent()) store.getState().addQuickRefImage(url);
  });
  const first = read(old, 'old');
  expect(store.getState().pendingAttachmentReads).toBe(1);
  store.getState().invalidatePromptAttachments();
  const second = read(current, 'current'), third = read(other, 'other');
  old.resolve(); await first;
  expect(store.getState().pendingAttachmentReads).toBe(2);
  expect(store.getState().quickRefImages).toEqual([]);
  other.resolve(); await third;
  expect(store.getState().pendingAttachmentReads).toBe(1);
  current.resolve(); await second;
  expect(store.getState().quickRefImages).toEqual(['other', 'current']);
  expect(store.getState().pendingAttachmentReads).toBe(0);
});

it('releases the pending state when a read fails', async () => {
  const store = createStore(createHomeSlice as unknown as import('zustand').StateCreator<AppState>);
  await expect(store.getState().readPromptAttachments(async () => { throw new Error('failed'); })).rejects.toThrow('failed');
  expect(store.getState().pendingAttachmentReads).toBe(0);
});
