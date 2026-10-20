import { z } from 'zod';
import { TextRequestRoutingFields } from './textRouting';

export const analyzeBodySchema = z
  .object({
    ...TextRequestRoutingFields,
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

export const collectVariantMetadataSchema = z.object({
  version: z.literal(1),
  variants: z.array(z.object({
    id: z.string().min(1), label: z.string().min(1), color: z.string().optional(),
    skuIds: z.array(z.string()), imageUrls: z.array(z.string().min(1)),
  })),
  requestedSkuId: z.string().optional(), selectedVariantId: z.string().optional(),
});
export type CollectVariantMetadata = z.infer<typeof collectVariantMetadataSchema>;

export const collectResponseSchema = z.object({
  success: z.boolean(),
  product: z.object({ variantMetadata: collectVariantMetadataSchema.optional() }).passthrough().optional(),
  images: z.object({ variantMetadata: collectVariantMetadataSchema.optional() }).passthrough().optional(),
}).passthrough();

export const collectBodySchema = z
  .object({
    url: z.string().max(4096).optional(),
    platform: z.string().max(64).optional(),
    forceRefresh: z.boolean().optional(),
  })
  .passthrough();

export type AnalyzeBody = z.infer<typeof analyzeBodySchema>;
export type CollectBody = z.infer<typeof collectBodySchema>;
