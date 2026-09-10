import { z } from 'zod';

export const ImageTaskStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'SUCCESS',
  'FAILURE',
]);

export const ImageTaskSchema = z.object({
  id: z.string(),
  productId: z.string().nullable().optional(),
  prompt: z.string(),
  taskId: z.string().nullable().optional(),
  status: ImageTaskStatusSchema,
  resultUrl: z.string().nullable().optional(),
  failReason: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  mediaType: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  quality: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.number(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.number(), z.date()]).optional(),
});

export const AssetTasksListResponseSchema = z.object({
  success: z.boolean().optional(),
  tasks: z.array(ImageTaskSchema).optional(),
  items: z.array(ImageTaskSchema).optional(),
  total: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
});

export type ImageTask = z.infer<typeof ImageTaskSchema>;
export type AssetTasksListResponse = z.infer<typeof AssetTasksListResponseSchema>;

export const DepthVideoStyleSchema = z.enum(['mocap', 'turbo', 'raw']);
export const DepthVideoColormapSchema = z.enum(['gray', 'turbo']);
export const DepthQualitySchema = z.enum(['fast', 'standard', 'high']);

export const DepthVideoSubmitBodySchema = z.object({
  videoDataUrl: z.string().min(1).optional(),
  videoUrl: z.string().min(1).optional(),
  style: DepthVideoStyleSchema.optional().default('mocap'),
  colormap: DepthVideoColormapSchema.optional(),
  quality: DepthQualitySchema.optional().default('standard'),
}).refine((body) => Boolean(body.videoDataUrl?.trim() || body.videoUrl?.trim()), {
  message: '请提供 videoDataUrl 或 videoUrl',
});

export const DepthVideoSubmitResponseSchema = z.object({
  success: z.boolean(),
  taskId: z.string().optional(),
  recordId: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
});

export const DepthVideoPollResponseSchema = z.object({
  success: z.boolean(),
  taskId: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILURE']).optional(),
  progress: z.string().optional(),
  stage: z.string().optional(),
  resultUrl: z.string().nullable().optional(),
  failReason: z.string().nullable().optional(),
  error: z.string().optional(),
});

export type DepthVideoSubmitBody = z.infer<typeof DepthVideoSubmitBodySchema>;
export type DepthVideoSubmitResponse = z.infer<typeof DepthVideoSubmitResponseSchema>;
export type DepthVideoPollResponse = z.infer<typeof DepthVideoPollResponseSchema>;

export const DepthImageResponseSchema = z.object({
  success: z.boolean(),
  resultUrl: z.string().optional(),
  style: DepthVideoStyleSchema.optional(),
  quality: DepthQualitySchema.optional(),
  modelId: z.string().optional(),
  inferenceSizePx: z.number().optional(),
  device: z.string().optional(),
  error: z.string().optional(),
});

export type DepthImageResponse = z.infer<typeof DepthImageResponseSchema>;
