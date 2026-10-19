import { describe, expect, it } from 'vitest';
import {
  claimSubmissionFlight,
  isSubmissionInFlight,
  releaseSubmissionFlight,
  shouldAbandonSubmissionRecovery,
} from './submissionFlight';

describe('submission recovery fuse', () => {
  it('does not abandon a task while its submit request is still in flight', () => {
    expect(claimSubmissionFlight('task-1')).toBe(true);
    expect(isSubmissionInFlight('task-1')).toBe(true);
    expect(shouldAbandonSubmissionRecovery(6, true)).toBe(false);
    releaseSubmissionFlight('task-1');
    expect(isSubmissionInFlight('task-1')).toBe(false);
    expect(shouldAbandonSubmissionRecovery(6, false)).toBe(true);
    expect(shouldAbandonSubmissionRecovery(5, false)).toBe(false);
  });

  it('refuses a second claim until the first request finishes', () => {
    expect(claimSubmissionFlight('task-2')).toBe(true);
    expect(claimSubmissionFlight('task-2')).toBe(false);
    releaseSubmissionFlight('task-2');
    expect(claimSubmissionFlight('task-2')).toBe(true);
    releaseSubmissionFlight('task-2');
  });
});
