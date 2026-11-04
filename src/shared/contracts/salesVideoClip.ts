import { z } from 'zod';

export const salesVideoClipBodySchema = z.object({
  sourceUrl: z.string().trim().min(1).max(8192),
  endSec: z.number().finite().min(0.1).max(600),
  maxDurationSec: z.number().finite().min(0.1).max(600).optional(),
}).refine((body) => body.maxDurationSec === undefined || body.maxDurationSec >= body.endSec, '动作参考时长上限不能短于动作结束时间');

export const salesVideoClipResponseSchema = z.object({
  success: z.literal(true),
  url: z.string().startsWith('/storage/'),
  startSec: z.literal(0),
  endSec: z.number().finite().positive().max(600),
  durationSec: z.number().finite().positive().max(600.1),
});

export type SalesDepthVideoClip = Omit<z.infer<typeof salesVideoClipResponseSchema>, 'success'>;
