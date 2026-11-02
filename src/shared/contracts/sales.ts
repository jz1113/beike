import { z } from 'zod';

export const salesOCRBodySchema = z.object({
  imageUrl: z.string().trim().min(1).max(8192),
  force: z.boolean().optional(),
});
export const salesOCRResultSchema = z.object({
  engine: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  text: z.string().max(100_000),
  lines: z.array(z.object({
    box: z.array(z.tuple([z.number().finite(), z.number().finite()])).length(4),
    text: z.string(),
    confidence: z.number().min(0).max(1),
  })).max(5000),
  cached: z.boolean(),
});
export type SalesOCRResult = z.infer<typeof salesOCRResultSchema>;
