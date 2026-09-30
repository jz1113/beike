import { z } from 'zod';

/** Wire input only; model defaults and capability rules belong to the service/domain. */
export const videoGenerationBodySchema = z.object({
  prompt: z.string().trim().min(1, '视频提示词不能为空').max(100_000),
  model: z.string().min(1).max(200).optional(),
  duration: z.number().finite().optional(),
  aspect_ratio: z.string().max(32).optional(),
  resolution: z.string().max(32).optional(),
  images: z.array(z.string().trim().min(1)).max(24).optional(),
  videos: z.array(z.string().trim().min(1)).max(8).optional(),
  watermark: z.boolean().optional(),
  productId: z.string().max(256).optional(),
  referenceImageUrl: z.string().optional(),
  first_frame_image: z.string().optional(),
  last_frame_image: z.string().optional(),
  ref_mode: z.string().max(64).optional(),
  camera_motion: z.string().max(200).optional(),
  camera_control: z.string().max(200).optional(),
  audio: z.boolean().optional(),
  fps: z.number().positive().optional(),
  seed: z.number().int().optional(),
  character: z.string().max(2000).optional(),
  character_id: z.string().max(256).optional(),
  storyboard: z.unknown().optional(),
  customBaseUrl: z.string().max(2048).optional(),
  customApiKey: z.string().max(4096).optional(),
  clientTaskId: z.string().max(256).optional(),
}).passthrough();

export type VideoGenerationBody = z.infer<typeof videoGenerationBodySchema>;
