import { z } from 'zod';

export const SystemConfigResponseSchema = z.object({
  success: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

export type SystemConfigResponse = z.infer<typeof SystemConfigResponseSchema>;
