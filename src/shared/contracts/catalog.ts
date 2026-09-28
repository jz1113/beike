import { z } from 'zod';

export const analyzeBodySchema = z
  .object({
    mode: z.string().max(64).optional(),
    productTitle: z.string().max(500).optional(),
    imageUrls: z.array(z.string().max(8192)).max(24).optional(),
    referenceImageUrls: z.array(z.string().max(8192)).max(24).optional(),
    model: z.string().max(200).optional(),
    shotCount: z.number().int().min(1).max(24).optional(),
    extraRequirements: z.string().max(20_000).optional(),
    customBaseUrl: z.string().max(2048).optional(),
    customApiKey: z.string().max(4096).optional(),
  })
  .passthrough();

export const collectBodySchema = z
  .object({
    url: z.string().max(4096).optional(),
    platform: z.string().max(64).optional(),
    forceRefresh: z.boolean().optional(),
  })
  .passthrough();

export type AnalyzeBody = z.infer<typeof analyzeBodySchema>;
export type CollectBody = z.infer<typeof collectBodySchema>;
