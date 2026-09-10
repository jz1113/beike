import {afterEach,expect,it,vi} from 'vitest';
import {createStreamPatchBatcher} from '../hooks/streamPatchBatcher';
afterEach(() => vi.useRealTimers());
it('merges a burst into one update preserving non-text fields', () => {
  vi.useFakeTimers();
  const commit = vi.fn();
  const batch = createStreamPatchBatcher<{content:string;thinking:string}>(commit);
  batch.push({content:'你'}); batch.push({thinking:'思考'}); batch.push({content:'你好'});
  expect(commit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(32);
  expect(commit).toHaveBeenCalledExactlyOnceWith({content:'你好',thinking:'思考'});
});
it('flushes before completion or interruption and cancels delayed writes', () => {
  vi.useFakeTimers();
  const commit = vi.fn();
  const batch = createStreamPatchBatcher<{content:string}>(commit);
  batch.push({content:'最后一段'}); batch.flush(); batch.flush();
  vi.runAllTimers();
  expect(commit).toHaveBeenCalledExactlyOnceWith({content:'最后一段'});
});
