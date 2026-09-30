import { z } from 'zod';

const identifier = z.string().trim().min(1).max(160);
const taxonomySchema = z.object({
  id: z.string().max(200),
  parentId: z.enum(['jewelry', 'digital_3c', 'apparel', 'bag', 'shoes', 'beauty', 'eyewear', 'universal']),
  label: z.string().max(500), shortLabel: z.string().max(200),
  anchorId: z.string().max(200).optional(), anatomy: z.string().max(500).optional(),
  keywords: z.array(z.string().max(500)).max(100), isCustom: z.boolean().optional(),
});
export const deconstructJobItemInputSchema = z.object({
  id: identifier, name: z.string().trim().min(1).max(500),
  images: z.array(z.string().min(1).max(28_000_000)).min(1).max(10),
  targetCategory: z.string().max(200).optional(),
  targetSubcategory: z.string().max(300).optional(),
  customSubCategories: z.array(taxonomySchema).max(100).optional(),
});
export const deconstructJobSubmitSchema = z.object({
  jobId: identifier, items: z.array(deconstructJobItemInputSchema).min(1).max(200),
  userHint: z.string().max(20_000).optional(), model: z.string().max(200).optional(),
  fallbackOrder: z.array(z.string().max(200)).max(30).optional(),
  concurrency: z.number().int().min(1).max(16).default(4),
  reviewBeforeSave: z.boolean().default(false),
  overrides: z.object({
    customBaseUrl: z.string().max(2048).optional(), customApiKey: z.string().max(4096).optional(),
    apiFormat: z.string().max(100).optional(), allowInsecureHttp: z.boolean().optional(),
  }).optional(),
}).superRefine((input, ctx) => {
  if (input.items.some(item => JSON.stringify(item.customSubCategories || []).length > 64_000)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '商品细分配置过大，请减少自定义细分规则', path: ['items'] });
  }
  if (new Set(input.items.map(item => item.id)).size !== input.items.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '图集任务 ID 不能重复', path: ['items'] });
  }
  if (input.items.reduce((sum, item) => sum + item.images.reduce((size, image) => size + image.length, 0), 0) > 80_000_000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: '本批图片数据过大，请减少图集数量', path: ['items'] });
  }
});
export const deconstructJobStopSchema = z.object({ action: z.literal('stop'), jobId: identifier });
export type DeconstructJobSubmit = z.infer<typeof deconstructJobSubmitSchema>;
export type DeconstructJobItemInput = z.infer<typeof deconstructJobItemInputSchema>;
export type DeconstructJobStatus = 'queued' | 'running' | 'stopping' | 'completed' | 'failed' | 'stopped' | 'interrupted';
export type DeconstructJobItemStatus = 'queued' | 'running' | 'done' | 'error' | 'stopped' | 'interrupted';
export type DeconstructJobItemResult =
  | { ok: true; partial: boolean; data: unknown; stats: unknown; reviewId?: string; usedModel?: string }
  | { ok: false; error: string };
export interface DeconstructJobItemSnapshot extends DeconstructJobItemInput {
  status: DeconstructJobItemStatus;
  progress?: { stage: string; message: string; startedAt: number; updatedAt: number };
  result?: DeconstructJobItemResult;
  error?: string; startedAt?: string; finishedAt?: string;
}
export interface DeconstructJobSnapshot {
  jobId: string; status: DeconstructJobStatus; items: DeconstructJobItemSnapshot[];
  concurrency: number; reviewBeforeSave: boolean; model?: string;
  createdAt: string; updatedAt: string; finishedAt?: string; error?: string;
}
