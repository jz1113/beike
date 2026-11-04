import { z } from 'zod';
import { TextRequestRoutingFields } from './textRouting';

export const SALES_SUMMARY_MAX_TEXT = 60_000;
const sourceFields = z.object({
  productFacts: z.string().trim().max(20000).optional(),
  textSources: z.array(z.object({
    index: z.number().int().min(0).max(99_999),
    text: z.string().trim().min(1).max(40_000),
  })).superRefine((sources, ctx) => {
    if (sources.reduce((total, source) => total + source.text.length, 0) > SALES_SUMMARY_MAX_TEXT) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OCR 文字合计最多 60000 字，请精简后重试。' });
    }
    if (new Set(sources.map((source) => source.index)).size !== sources.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'OCR 文字来源编号不能重复。' });
    }
  }),
});
const hasEvidence = (input: { productFacts?: string; textSources: unknown[] }) => Boolean(input.productFacts || input.textSources.length);
export const salesSummaryInputSchema = sourceFields.refine(hasEvidence, '请提供商品资料或已核对的 OCR 文字');
export const salesSummaryBodySchema = sourceFields.extend({
  model: z.string().trim().min(1).max(200),
  ...TextRequestRoutingFields,
  customBaseUrl: z.string().max(8192).optional(),
  customApiKey: z.string().max(8192).optional(),
  apiFormat: z.literal('openai-responses').optional(),
  allowInsecureHttp: z.boolean().optional(),
}).refine(hasEvidence, '请提供商品资料或已核对的 OCR 文字');
export const salesSummaryResultSchema = z.object({
  summary: z.string().trim().min(1).max(1000),
  points: z.array(z.object({
    feature: z.string().trim().min(1).max(1000),
    benefit: z.string().trim().min(1).max(1000),
    expression: z.string().trim().min(1).max(1000),
    sources: z.array(z.string().min(1).max(40)).min(1).max(16),
  })).max(6),
  copy: z.string().max(4000),
  copyPointIndexes: z.array(z.number().int().min(1).max(6)).max(3).default([]),
  conflicts: z.array(z.string().trim().min(1).max(1000)).max(6),
  questions: z.array(z.string().trim().min(1).max(1000)).max(3),
  cautions: z.array(z.string().trim().min(1).max(1000)).max(6).default([]),
}).refine((result) => result.points.length > 0 ? Boolean(result.copy.trim()) : result.questions.length > 0, '缺少完整文案或待确认信息')
  .refine((result) => new Set(result.copyPointIndexes).size === result.copyPointIndexes.length && result.copyPointIndexes.every((index) => index <= result.points.length), '成稿引用了不存在或重复的买点');
export const salesSummaryResponseSchema = z.object({
  success: z.literal(true),
  result: salesSummaryResultSchema,
  model: z.string().min(1),
  skillVersion: z.string().min(1),
});
export type SalesSummaryInput = z.infer<typeof salesSummaryInputSchema>;
export type SalesSummaryResult = z.infer<typeof salesSummaryResultSchema>;
export type SalesSummaryResponse = z.infer<typeof salesSummaryResponseSchema>;
