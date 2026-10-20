import { z } from 'zod';

export const productColorVariantSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  color: z.string().trim().min(1).optional(),
  skuIds: z.array(z.string().trim().min(1)),
  imageUrls: z.array(z.string().trim().min(1)),
});

export const productVariantMetadataSchema = z.object({
  version: z.literal(1),
  variants: z.array(productColorVariantSchema),
  requestedSkuId: z.string().trim().min(1).optional(),
  selectedVariantId: z.string().trim().min(1).optional(),
}).superRefine((metadata, ctx) => {
  const ids = metadata.variants.map(variant => variant.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['variants'], message: '规格标识重复' });
  if (metadata.selectedVariantId && !ids.includes(metadata.selectedVariantId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedVariantId'], message: '选中规格不存在' });
  }
});

export type ProductColorVariant = z.infer<typeof productColorVariantSchema>;
export type ProductVariantMetadata = z.infer<typeof productVariantMetadataSchema>;
