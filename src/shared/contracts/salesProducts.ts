import { z } from 'zod';

export const salesProductCategoryContractSchema = z.enum([
  'beauty',
  'food',
  'home',
  'fashion',
  'tech',
  'other',
]);

export const salesProductAudienceContractSchema = z.enum([
  'adult_male',
  'adult_female',
  'senior_male',
  'senior_female',
  'child_male',
  'child_female',
  'adult_unisex',
  'senior_unisex',
  'child_unisex',
  'unknown',
]);

export const salesClassificationSourceContractSchema = z.enum(['auto', 'manual']);

export const salesProductRecordSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().max(500).default(''),
  productUrl: z.string().max(4096).default(''),
  collectedProductUrl: z.string().max(4096).default(''),
  platform: z.string().max(64).default(''),
  sku: z.string().max(120).default(''),
  brand: z.string().max(240).default(''),
  category: salesProductCategoryContractSchema.catch('other'),
  categorySource: salesClassificationSourceContractSchema.catch('auto'),
  audience: salesProductAudienceContractSchema.catch('unknown'),
  audienceSource: salesClassificationSourceContractSchema.catch('auto'),
  coverUrl: z.string().max(4096).default(''),
  imageCount: z.number().int().min(0).default(0),
  selectedImageCount: z.number().int().min(0).default(0),
  hasSummary: z.boolean().default(false),
  outputCount: z.number().int().min(0).default(0),
  draftJson: z.string().default('{}'),
  lastOpenedAt: z.string().default(''),
  createdAt: z.string().default(''),
  updatedAt: z.string().default(''),
});

export const salesProductUpsertBodySchema = z.object({
  id: z.string().trim().max(120).optional(),
  title: z.string().trim().max(500).default(''),
  productUrl: z.string().trim().max(4096).default(''),
  collectedProductUrl: z.string().trim().max(4096).default(''),
  platform: z.string().trim().max(64).default(''),
  sku: z.string().trim().max(120).default(''),
  brand: z.string().trim().max(240).default(''),
  category: salesProductCategoryContractSchema.default('other'),
  categorySource: salesClassificationSourceContractSchema.default('auto'),
  audience: salesProductAudienceContractSchema.default('unknown'),
  audienceSource: salesClassificationSourceContractSchema.default('auto'),
  coverUrl: z.string().trim().max(4096).default(''),
  imageCount: z.number().int().min(0).default(0),
  selectedImageCount: z.number().int().min(0).default(0),
  hasSummary: z.boolean().default(false),
  draftJson: z.string().max(2_000_000).default('{}'),
  markOpened: z.boolean().optional(),
});

export const salesProductPatchBodySchema = z.object({
  title: z.string().trim().max(500).optional(),
  category: salesProductCategoryContractSchema.optional(),
  categorySource: salesClassificationSourceContractSchema.optional(),
  audience: salesProductAudienceContractSchema.optional(),
  audienceSource: salesClassificationSourceContractSchema.optional(),
  incrementOutput: z.boolean().optional(),
  markOpened: z.boolean().optional(),
});

export const salesProductListResponseSchema = z.object({
  success: z.literal(true),
  items: z.array(salesProductRecordSchema).default([]),
});

export const salesProductSingleResponseSchema = z.object({
  success: z.literal(true),
  item: salesProductRecordSchema,
});

export type SalesProductRecord = z.infer<typeof salesProductRecordSchema>;
export type SalesProductUpsertBody = z.infer<typeof salesProductUpsertBodySchema>;
export type SalesProductPatchBody = z.infer<typeof salesProductPatchBodySchema>;

