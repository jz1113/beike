import { z } from 'zod';

export const salesAssetViewGridResponseSchema = z.object({
  success: z.literal(true),
  images: z.array(z.object({
    view: z.enum([
      'sheet', 'face', 'front', 'side', 'threeQuarterLeft', 'threeQuarterRight', 'back', 'sideRight', 'upperBody', 'backThreeQuarter',
      'left', 'right', 'reverse', 'frontWide', 'leftWide', 'rightWide', 'reverseLeft', 'reverseRight', 'detail',
    ]),
    url: z.string().min(1),
  })).refine((images) => (images.length === 1 ? images[0].view === 'sheet' : [4, 9].includes(images.length) && images.every(({ view }) => view !== 'sheet')) && new Set(images.map((image) => image.view)).size === images.length, '视角数量或顺序标识无效'),
});

const salesAssetCreationSchema = z.object({
  referenceImageUrl: z.string().min(1),
  prompt: z.string().optional(),
  imageUrl: z.string().optional(),
  promptModel: z.string().optional(),
  imageModel: z.string().optional(),
});

const assetUsageScopeSchema = z.object({
  workspaceId: z.string().regex(/^[a-f0-9]{64}$/), channelId: z.string().regex(/^[a-f0-9]{64}$/),
  mediaType: z.enum(['vision', 'image']), epoch: z.string().min(1).max(160),
});
const assetUsageReceiptSchema = z.object({
  stage: z.enum(['analysis', 'main', 'views']), modelId: z.string().min(1),
  taskId: z.string().optional(), recordId: z.string().optional(), success: z.boolean(),
  usage: z.object({ promptTokens: z.number().nonnegative(), completionTokens: z.number().nonnegative(), totalTokens: z.number().nonnegative() }).optional(),
});

export const salesAssetViewJobSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  kind: z.enum(['persona', 'scene']),
  assetId: z.string(),
  model: z.string(),
  name: z.string().optional(),
  status: z.enum(['queued', 'analyzing', 'creating', 'generating', 'cropping', 'saving', 'completed', 'failed']),
  error: z.string(),
  images: z.record(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  creation: salesAssetCreationSchema.optional(),
  usageScopes: z.record(assetUsageScopeSchema).optional(),
  usageReceipts: z.array(assetUsageReceiptSchema).optional(),
});

export type SalesAssetViewJob = z.infer<typeof salesAssetViewJobSchema>;

export const salesAssetViewJobResponseSchema = z.object({ success: z.literal(true), job: salesAssetViewJobSchema });
export const salesAssetViewJobsResponseSchema = z.object({ success: z.literal(true), jobs: z.array(salesAssetViewJobSchema) });

export const salesAssetViewJobBodySchema = z.object({
  key: z.string().trim().min(1).max(256),
  kind: z.enum(['persona', 'scene']),
  assetId: z.string().max(160).optional(),
  data: z.record(z.unknown()),
  generation: z.record(z.unknown()),
  checkpoint: z.object({ taskId: z.string().optional(), recordId: z.string().optional(), resultUrl: z.string().optional() }).optional(),
});

const salesPromptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  prompt: z.string(),
  defaultPrompt: z.string().min(1),
  version: z.string().min(1),
  customized: z.boolean(),
  configured: z.boolean().default(false),
});

export const salesPromptListSchema = z.object({
  success: z.literal(true), prompts: z.array(salesPromptSchema),
});
export const salesPromptResultSchema = z.object({
  success: z.literal(true), prompt: salesPromptSchema,
});
export type SalesPrompt = z.infer<typeof salesPromptSchema>;
