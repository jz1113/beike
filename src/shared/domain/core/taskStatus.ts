export const CANONICAL_TASK_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'expired',
] as const;

export type CanonicalTaskStatus = (typeof CANONICAL_TASK_STATUSES)[number];

export type ImageTaskWireStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';

const IMAGE_TASK_MAP: Record<string, CanonicalTaskStatus> = {
  PENDING: 'queued',
  IDLE: 'queued',
  NOT_START: 'queued',
  SUBMITTED: 'queued',
  QUEUED: 'queued',
  IN_PROGRESS: 'running',
  PROCESSING: 'running',
  SUCCESS: 'succeeded',
  SUCCEEDED: 'succeeded',
  COMPLETED: 'succeeded',
  FAILURE: 'failed',
  FAILED: 'failed',
  ERROR: 'failed',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
  EXPIRED: 'expired',
};

const ASSISTANT_TURN_MAP: Record<string, CanonicalTaskStatus> = {
  running: 'running',
  completed: 'succeeded',
  interrupted: 'cancelled',
  awaiting_approval: 'running',
  failed: 'failed',
};

export function fromImageTaskStatus(status: string | null | undefined): CanonicalTaskStatus {
  if (!status) return 'queued';
  return IMAGE_TASK_MAP[status] || IMAGE_TASK_MAP[status.toUpperCase()] || 'running';
}

export function toImageTaskStatus(status: CanonicalTaskStatus): ImageTaskWireStatus {
  switch (status) {
    case 'queued':
      return 'PENDING';
    case 'running':
      return 'IN_PROGRESS';
    case 'succeeded':
      return 'SUCCESS';
    case 'failed':
      return 'FAILURE';
    case 'cancelled':
    case 'expired':
      return 'CANCELLED';
  }
}

export function fromAssistantTurnStatus(status: string | null | undefined): CanonicalTaskStatus {
  if (!status) return 'queued';
  return ASSISTANT_TURN_MAP[status] || 'running';
}

export function isCanonicalTerminal(status: CanonicalTaskStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'expired';
}

export function isImageTaskTerminal(status: string | null | undefined): boolean {
  return isCanonicalTerminal(fromImageTaskStatus(status));
}

export type UiGenerationStatus = 'IDLE' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';

export function toUiGenerationStatus(status: string | null | undefined): UiGenerationStatus {
  switch (fromImageTaskStatus(status)) {
    case 'queued':
      return 'IDLE';
    case 'running':
      return 'IN_PROGRESS';
    case 'succeeded':
      return 'SUCCESS';
    default:
      return 'FAILURE';
  }
}

export function isImageTaskQueued(status: string | null | undefined): boolean {
  return fromImageTaskStatus(status) === 'queued';
}

export function isImageTaskRunning(status: string | null | undefined): boolean {
  return fromImageTaskStatus(status) === 'running';
}

export function isImageTaskActive(status: string | null | undefined): boolean {
  const canonical = fromImageTaskStatus(status);
  return canonical === 'queued' || canonical === 'running';
}

export function isImageTaskFailed(status: string | null | undefined): boolean {
  const canonical = fromImageTaskStatus(status);
  return canonical === 'failed' || canonical === 'cancelled' || canonical === 'expired';
}

export function isImageTaskSucceeded(status: string | null | undefined): boolean {
  return fromImageTaskStatus(status) === 'succeeded';
}
