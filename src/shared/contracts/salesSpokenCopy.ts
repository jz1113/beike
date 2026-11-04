import { z } from 'zod';
import { TextRequestRoutingFields } from './textRouting';

const spokenBeatInputSchema = z.object({
  index: z.number().int().min(0),
  start: z.number().finite().min(0),
  end: z.number().finite().positive().max(600),
  action: z.string().max(2000),
  expression: z.string().max(600).optional(),
  transition: z.string().max(400).optional(),
  shotIndex: z.number().int().min(0).optional(),
  shotSize: z.string().max(200).optional(),
  camera: z.string().max(1000).optional(),
  requiredView: z.string().max(80).optional(),
  assignedView: z.string().max(80).optional(),
  subject: z.string().max(2000).optional(),
  purpose: z.string().max(200).optional(),
  buyingPoint: z.string().max(1000).optional(),
  spokenLine: z.string().max(2000).default(''),
  subtitle: z.string().max(1000).default(''),
  sourceVoiceText: z.string().max(1000).optional(),
  sourceLinePattern: z.string().max(600).optional(),
  sourceSubtitle: z.string().max(400).optional(),
}).refine((beat) => beat.end > beat.start, '分镜结束时间必须晚于开始时间');

export const salesSpokenCopyBodySchema = z.object({
  reviewOnly: z.boolean().optional(),
  unresolved: z.array(z.string().max(1000)).max(9).optional(),
  sourceCopy: z.string().max(10_000).default(''),
  productName: z.string().max(2000),
  summary: z.string().max(2000).default(''),
  facts: z.string().max(20_000).default(''),
  buyingPoints: z.array(z.string().max(1000)).max(12).default([]),
  cautions: z.array(z.string().max(1000)).max(12).default([]),
  sourceExclusions: z.array(z.union([
    z.string().max(200),
    z.object({ term: z.string().trim().min(1).max(200), type: z.string().trim().min(1).max(80) }),
  ])).max(40).optional(),
  voiceMode: z.enum(['speech', 'voiceover']),
  duration: z.number().finite().positive().max(600),
  targetCps: z.number().finite().min(2).max(4.6).default(3.8),
  beats: z.array(spokenBeatInputSchema).min(1).max(24),
  model: z.string().trim().min(1).max(200),
  ...TextRequestRoutingFields,
  customBaseUrl: z.string().max(8192).optional(),
  customApiKey: z.string().max(8192).optional(),
  apiFormat: z.literal('openai-responses').optional(),
  allowInsecureHttp: z.boolean().optional(),
});

export const salesSpokenCopyResponseSchema = z.object({
  success: z.literal(true),
  beats: z.array(z.object({
    index: z.number().int().min(0),
    spokenLine: z.string(),
    subtitle: z.string(),
  })).min(1).max(24),
  model: z.string(),
  promptVersion: z.string(),
  reviewPromptVersion: z.string().min(1),
});

/** A transport failure can carry a draft for review retries, never an approval. */
export const salesSpokenCopyPendingReviewSchema = salesSpokenCopyResponseSchema
  .pick({ beats: true, promptVersion: true })
  .extend({ promptVersion: z.string().trim().min(1) });

export type SalesSpokenCopyPendingReview = z.infer<typeof salesSpokenCopyPendingReviewSchema>;

export type SalesSpokenCopyInput = Omit<z.input<typeof salesSpokenCopyBodySchema>,
  'model' | 'textProtocol' | 'customBaseUrl' | 'customApiKey' | 'apiFormat' | 'allowInsecureHttp'>;
