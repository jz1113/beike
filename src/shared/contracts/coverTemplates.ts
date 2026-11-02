import { z } from 'zod';
export const CoverTemplateSchema = z.object({
  id: z.string(), title: z.string(), imageUrls: z.array(z.string()),
  status: z.enum(['pending', 'adopted', 'trashed', 'running', 'failed']),
  createdAt: z.string(), updatedAt: z.string(), error: z.string(),
});
export const CoverTemplateListSchema = z.object({ success: z.boolean(), templates: z.array(CoverTemplateSchema), total: z.number(), offset: z.number(), pageSize: z.number() });
export const CoverTemplateDetailSchema = z.object({ success: z.boolean(), prompt: z.string(), legacy: z.boolean() });
export type CoverTemplate = z.infer<typeof CoverTemplateSchema>;
