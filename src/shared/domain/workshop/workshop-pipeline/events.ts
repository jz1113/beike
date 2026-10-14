export const WORKSHOP_BATCH_EVENT_TYPES = [
  'START_COLLECTION',
  'COLLECTION_FINISHED',
  'CONFIRM_PLAN',
  'START_ANALYSIS',
  'ANALYSIS_FINISHED',
  'APPROVE_STORYBOARD',
  'START_GENERATION',
  'GENERATION_FINISHED',
  'SUBMIT_OUTPUT_REVIEW',
  'COMPLETE_BATCH',
  'PAUSE_RUN',
  'RESUME_RUN',
  'CANCEL_BATCH',
  'ARCHIVE_BATCH',
] as const;

export type WorkshopBatchEventType = (typeof WORKSHOP_BATCH_EVENT_TYPES)[number];

export type WorkshopBatchEvent =
  | { type: 'START_COLLECTION' }
  | { type: 'COLLECTION_FINISHED' }
  | { type: 'CONFIRM_PLAN'; planRevision: number }
  | { type: 'START_ANALYSIS'; runId: string }
  | { type: 'ANALYSIS_FINISHED'; result: 'success' | 'partial_failed' }
  | { type: 'APPROVE_STORYBOARD'; storyboardRevision: number }
  | { type: 'START_GENERATION'; runId: string }
  | { type: 'GENERATION_FINISHED'; result: 'success' | 'partial_failed' }
  | { type: 'SUBMIT_OUTPUT_REVIEW' }
  | { type: 'COMPLETE_BATCH' }
  | { type: 'PAUSE_RUN'; runId: string }
  | { type: 'RESUME_RUN'; runId: string }
  | { type: 'CANCEL_BATCH' }
  | { type: 'ARCHIVE_BATCH' };

export function isWorkshopBatchEventType(value: string | null | undefined): value is WorkshopBatchEventType {
  return Boolean(value && (WORKSHOP_BATCH_EVENT_TYPES as readonly string[]).includes(value));
}
