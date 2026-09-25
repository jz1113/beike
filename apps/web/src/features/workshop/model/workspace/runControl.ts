export type RunControlStatus = 'running' | 'paused' | 'cancelled';

export interface RunControl {
  status: RunControlStatus;
}

export function createRunControl(): RunControl {
  return { status: 'running' };
}
