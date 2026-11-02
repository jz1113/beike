import { z } from 'zod';

export const salesAssetViewGridResponseSchema = z.object({
  success: z.literal(true),
  images: z.array(z.object({
    view: z.enum([
      'face', 'front', 'side', 'threeQuarterLeft', 'threeQuarterRight', 'back', 'sideRight', 'upperBody', 'backThreeQuarter',
      'left', 'right', 'reverse', 'frontWide', 'leftWide', 'rightWide', 'reverseLeft', 'reverseRight', 'detail',
    ]),
    url: z.string().min(1),
  })).length(9).refine((images) => new Set(images.map((image) => image.view)).size === 9, '九宫格视角不能重复'),
});

export const salesAssetViewJobSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  kind: z.enum(['persona', 'scene']),
  assetId: z.string(),
  model: z.string(),
  name: z.string().optional(),
  status: z.enum(['queued', 'generating', 'cropping', 'saving', 'completed', 'failed']),
  error: z.string(),
  images: z.record(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
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
  checkpoint: z.object({ taskId: z.string().optional(), resultUrl: z.string().optional() }).optional(),
});
