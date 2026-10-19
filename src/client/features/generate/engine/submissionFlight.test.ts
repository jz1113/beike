import { describe, expect, it } from 'vitest';
import {
  claimSubmissionFlight,
  isSubmissionInFlight,
  nextSubmissionRecovery,
  releaseSubmissionFlight,
  shouldAbandonSubmissionRecovery,
  SUBMISSION_RECOVERY_TIMEOUT,
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

  it('keeps waiting while the server says the submission is still in progress', () => {
    expect(nextSubmissionRecovery(4, 'pending')).toEqual({ count: 0, abandon: false });
    expect(nextSubmissionRecovery(6, 'inflight')).toEqual({ count: 0, abandon: false });
  });

  it('shows the request error after the post ended and the server has no record', () => {
    let count = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const step = nextSubmissionRecovery(count, 'missing', '上游返回 400：尺寸不合法');
      expect(step.abandon).toBe(false);
      count = step.count;
    }
    expect(nextSubmissionRecovery(count, 'missing', '上游返回 400：尺寸不合法')).toEqual({
      count: 6,
      abandon: true,
      reason: '上游返回 400：尺寸不合法',
    });
  });

  it('uses the timeout copy only when the request itself has no error', () => {
    expect(nextSubmissionRecovery(5, 'missing')).toEqual({
      count: 6,
      abandon: true,
      reason: SUBMISSION_RECOVERY_TIMEOUT,
    });
  });

  it('refuses a second claim until the first request finishes', () => {
    expect(claimSubmissionFlight('task-2')).toBe(true);
    expect(claimSubmissionFlight('task-2')).toBe(false);
    releaseSubmissionFlight('task-2');
    expect(claimSubmissionFlight('task-2')).toBe(true);
    releaseSubmissionFlight('task-2');
  });
});
