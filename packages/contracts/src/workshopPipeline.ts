import { z } from 'zod';

export const WORKSHOP_BATCH_STATUSES = [
  'draft',
  'collecting',
  'plan_ready',
  'analyzing',
  'review_required',
  'approved',
  'generating',
  'qc_required',
  'partial_failed',
  'paused',
  'completed',
  'cancelled',
  'archived',
] as const;

export const workshopBatchStatusSchema = z.preprocess(
  (value) => (value === 'review' ? 'review_required' : value),
  z.enum(WORKSHOP_BATCH_STATUSES),
);
export type WorkshopBatchStatus = (typeof WORKSHOP_BATCH_STATUSES)[number];

export const pipelineRunKindSchema = z.enum([
  'collection',
  'analysis',
  'generation',
  'copywriting',
  'export',
]);
export type PipelineRunKind = z.infer<typeof pipelineRunKindSchema>;

export const pipelineRunStatusSchema = z.enum([
  'queued',
  'running',
  'paused',
  'completed',
  'partial_failed',
  'failed',
  'cancelled',
]);
export type PipelineRunStatus = z.infer<typeof pipelineRunStatusSchema>;

export const pipelineRunSummarySchema = z.object({
  id: z.string(),
  batchId: z.string(),
  kind: pipelineRunKindSchema,
  status: pipelineRunStatusSchema,
  inputRevision: z.number().int().min(0).default(0),
  totalTasks: z.number().int().min(0).default(0),
  completedTasks: z.number().int().min(0).default(0),
  successTasks: z.number().int().min(0).default(0),
  failedTasks: z.number().int().min(0).default(0),
  pausedFrom: workshopBatchStatusSchema.optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  errorSummary: z.string().optional(),
});
export type PipelineRunSummary = z.infer<typeof pipelineRunSummarySchema>;

export const previousGroupSignatureSchema = z.object({
  scene: z.string(),
  actionDigest: z.string(),
  lookBible: z.string().optional(),
});

export const diversityContextSchema = z.object({
  groupSignatures: z.array(previousGroupSignatureSchema).max(6).default([]),
  actionIds: z.array(z.string()).max(24).default([]),
  sceneIds: z.array(z.string()).max(24).default([]),
}).default({ groupSignatures: [], actionIds: [], sceneIds: [] });

export const workshopPipelineStateSchema = z.object({
  status: workshopBatchStatusSchema,
  pausedFrom: workshopBatchStatusSchema.optional(),
  planRevision: z.number().int().min(0).default(0),
  storyboardRevision: z.number().int().min(0).default(0),
  diversityContext: diversityContextSchema,
  runs: z.array(pipelineRunSummarySchema).max(50).default([]),
});
export type WorkshopPipelineState = z.infer<typeof workshopPipelineStateSchema>;

export const outputReviewDecisionSchema = z.enum([
  'unreviewed',
  'accepted',
  'retry_requested',
  'rejected',
]);
export type OutputReviewDecision = z.infer<typeof outputReviewDecisionSchema>;

export const workshopBatchEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('START_COLLECTION') }),
  z.object({ type: z.literal('COLLECTION_FINISHED') }),
  z.object({ type: z.literal('CONFIRM_PLAN'), planRevision: z.number().int().min(0) }),
  z.object({ type: z.literal('START_ANALYSIS'), runId: z.string().min(1) }),
  z.object({ type: z.literal('ANALYSIS_FINISHED'), result: z.enum(['success', 'partial_failed']) }),
  z.object({ type: z.literal('APPROVE_STORYBOARD'), storyboardRevision: z.number().int().min(0) }),
  z.object({ type: z.literal('START_GENERATION'), runId: z.string().min(1) }),
  z.object({ type: z.literal('GENERATION_FINISHED'), result: z.enum(['success', 'partial_failed']) }),
  z.object({ type: z.literal('SUBMIT_OUTPUT_REVIEW') }),
  z.object({ type: z.literal('COMPLETE_BATCH') }),
  z.object({ type: z.literal('PAUSE_RUN'), runId: z.string().min(1) }),
  z.object({ type: z.literal('RESUME_RUN'), runId: z.string().min(1) }),
  z.object({ type: z.literal('CANCEL_BATCH') }),
  z.object({ type: z.literal('ARCHIVE_BATCH') }),
]);
export type WorkshopBatchEvent = z.infer<typeof workshopBatchEventSchema>;

export const workshopBatchEventRequestSchema = z.object({
  revision: z.number().int().min(1),
  event: workshopBatchEventSchema,
});

export const outputReviewRequestSchema = z.object({
  decision: z.enum(['accepted', 'retry_requested', 'rejected']),
  scores: z.object({
    productFidelity: z.number().int().min(0).max(100).optional(),
    composition: z.number().int().min(0).max(100).optional(),
    aesthetic: z.number().int().min(0).max(100).optional(),
    consistency: z.number().int().min(0).max(100).optional(),
  }).optional(),
  reasonCodes: z.array(z.string()).max(32).optional(),
  note: z.string().max(2000).optional(),
});
