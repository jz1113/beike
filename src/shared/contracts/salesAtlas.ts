import { z } from 'zod';

export const atlasI18nTextSchema = z.object({
  zh: z.string().default(''),
  en: z.string().default(''),
  ja: z.string().default(''),
});

export const atlasPoseAngleMetaSchema = z.object({
  key: z.string().min(1),
  names: atlasI18nTextSchema,
});

export const atlasPoseSeriesMetaSchema = z.object({
  key: z.string().min(1),
  names: atlasI18nTextSchema,
  short: atlasI18nTextSchema,
  poseCount: z.number().int().min(0).default(0),
  imageCount: z.number().int().min(0).default(0),
});

export const atlasPoseCategoryMetaSchema = z.object({
  key: z.string().min(1),
  names: atlasI18nTextSchema,
});

export const atlasPoseVariantSchema = z.object({
  angle: z.string().min(1),
  thumbUrl: z.string().default(''),
  fullUrl: z.string().default(''),
});

export const atlasPoseItemSchema = z.object({
  id: z.string().min(1),
  series: z.string().default(''),
  category: z.string().default(''),
  no: z.string().default(''),
  names: atlasI18nTextSchema,
  variants: z.array(atlasPoseVariantSchema).default([]),
});

export const atlasPosesCatalogSchema = z.object({
  angles: z.array(atlasPoseAngleMetaSchema).default([]),
  series: z.array(atlasPoseSeriesMetaSchema).default([]),
  categories: z.array(atlasPoseCategoryMetaSchema).default([]),
  categoriesBySeries: z.record(z.string(), z.array(z.string())).default({}),
  items: z.array(atlasPoseItemSchema).default([]),
});

export const atlasFaceSectionMetaSchema = z.object({
  key: z.string().min(1),
  names: atlasI18nTextSchema,
  note: atlasI18nTextSchema,
  count: z.number().int().min(0).default(0),
});

export const atlasFaceHairMetaSchema = z.object({
  key: z.string().min(1),
  names: atlasI18nTextSchema,
  count: z.number().int().min(0).default(0),
});

export const atlasFaceItemSchema = z.object({
  id: z.string().min(1),
  section: z.string().default('face'),
  hair: z.string().default(''),
  style: z.string().default(''),
  width: z.number().int().min(0).default(400),
  height: z.number().int().min(0).default(500),
  thumbUrl: z.string().default(''),
  fullUrl: z.string().default(''),
  remoteFullUrl: z.string().default(''),
});

export const atlasFacesCatalogSchema = z.object({
  sections: z.array(atlasFaceSectionMetaSchema).default([]),
  hairs: z.array(atlasFaceHairMetaSchema).default([]),
  items: z.array(atlasFaceItemSchema).default([]),
});

export const salesAtlasCatalogResponseSchema = z.object({
  success: z.literal(true),
  synced: z.boolean().default(false),
  setupCommand: z.string().default('pnpm setup:atlas'),
  poses: atlasPosesCatalogSchema.nullable().default(null),
  faces: atlasFacesCatalogSchema.nullable().default(null),
});

export const salesAtlasImportBodySchema = z.object({
  kind: z.enum(['face', 'pose']),
  ids: z.array(z.string().trim().min(1)).min(1).max(60),
  preferredAngle: z.string().trim().max(40).optional(),
  audience: z.enum(['adult_male', 'adult_female', 'senior_male', 'senior_female', 'child_male', 'child_female', 'unknown']).optional(),
  customNames: z.record(z.string(), z.string().trim().max(120)).optional(),
});

export const salesAtlasImportResponseSchema = z.object({
  success: z.literal(true),
  kind: z.enum(['face', 'pose']),
  imported: z.number().int().min(0),
  skipped: z.number().int().min(0),
  importedIds: z.array(z.string()).default([]),
});

export type AtlasPoseItem = z.infer<typeof atlasPoseItemSchema>;
export type AtlasPoseVariant = z.infer<typeof atlasPoseVariantSchema>;
export type AtlasPosesCatalog = z.infer<typeof atlasPosesCatalogSchema>;
export type AtlasFaceItem = z.infer<typeof atlasFaceItemSchema>;
export type AtlasFacesCatalog = z.infer<typeof atlasFacesCatalogSchema>;
export type SalesAtlasCatalogResponse = z.infer<typeof salesAtlasCatalogResponseSchema>;
export type SalesAtlasImportBody = z.infer<typeof salesAtlasImportBodySchema>;
export type SalesAtlasImportResponse = z.infer<typeof salesAtlasImportResponseSchema>;

