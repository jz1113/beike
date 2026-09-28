import { z } from 'zod';

export const promptAssetTypeSchema = z.enum(['scene', 'outfit', 'action', 'persona', 'full_prompt']);
export const promptAssetStatusSchema = z.enum([
  'draft',
  'pending_review',
  'published',
  'needs_fix',
  'disabled',
  'archived',
]);

export const promptAssetRegistrySchema = z.object({
  id: z.string(),
  assetType: promptAssetTypeSchema,
  sourceAssetId: z.string(),
  status: promptAssetStatusSchema,
  version: z.number().int().min(1),
  provenance: z.string(),
  sourceRef: z.string().nullable().optional(),
  qualityScore: z.number().nullable().optional(),
  confidence: z.number().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  disabledReason: z.string().nullable().optional(),
  firstPassAcceptRate: z.number().nullable().optional(),
  retryRate: z.number().nullable().optional(),
  categoryCoverage: z.number().nullable().optional(),
});

export const usageEventTypeSchema = z.enum([
  'recommended',
  'locked',
  'analysis_used',
  'generation_submitted',
  'generation_succeeded',
  'generation_failed',
  'output_accepted',
  'retry_requested',
  'output_rejected',
  'output_exported',
]);

export const usageEventRequestSchema = z.object({
  assetId: z.string().min(1),
  batchId: z.string().min(1),
  productId: z.string().optional(),
  taskId: z.string().optional(),
  eventType: usageEventTypeSchema,
  metadata: z.record(z.unknown()).optional(),
});

export const lifecycleActionSchema = z.enum(['submit-review', 'publish', 'disable', 'create-version']);
export const disableAssetRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});
