import { z } from 'zod';

export const canvasTextRequest = z.object({
  model: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(20000),
  customBaseUrl: z.string().optional(),
  customApiKey: z.string().optional(),
  apiFormat: z.literal('openai-responses').optional(),
  allowInsecureHttp: z.boolean().optional(),
});
