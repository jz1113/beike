import { z } from 'zod';

export const salesScriptTaxonomyKindSchema = z.enum(['category', 'style']);
export const salesScriptTaxonomyItemSchema = z.object({
  id: z.string().min(1).max(120),
  kind: salesScriptTaxonomyKindSchema,
  name: z.string().trim().min(1).max(40),
});
export const salesScriptTaxonomyListSchema = z.object({
  success: z.literal(true), items: z.array(salesScriptTaxonomyItemSchema),
});
export const salesScriptTaxonomyResultSchema = z.object({
  success: z.literal(true), item: salesScriptTaxonomyItemSchema,
});
export type ScriptTaxonomyKind = z.infer<typeof salesScriptTaxonomyKindSchema>;
export type ScriptTaxonomyItem = z.infer<typeof salesScriptTaxonomyItemSchema>;
