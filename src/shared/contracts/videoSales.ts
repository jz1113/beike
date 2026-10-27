import { z } from 'zod';
import { TextRequestRoutingFields } from './textRouting';

export const videoSalesCatalogImageSchema = z.object({
  index: z.number().int().nonnegative(), url: z.string().min(1), role: z.string().min(1),
});
const categorySchema = z.literal('fashion');
const aspectRatioSchema = z.enum(['9:16', '16:9', '3:4', '1:1']);
const modelFields = {
  ...TextRequestRoutingFields,
  model: z.string().optional(), customBaseUrl: z.string().optional(), customApiKey: z.string().optional(),
  skillId: z.literal('fashion-video-sales').optional(), skillRevision: z.string().length(64).optional(),
};
const workflowFields = {
  workflowVersion: z.literal(3),
  eligibleImageIndexes: z.array(z.number().int().nonnegative()).min(1).max(40),
  selectedColor: z.string().max(200).optional(),
};
const catalogSchema = z.array(videoSalesCatalogImageSchema).min(1).max(40);

function checkCatalog(value: {
  workflowVersion?: 3; eligibleImageIndexes?: number[];
  imageCatalog?: Array<{ index: number; url: string }>;
}, ctx: z.RefinementCtx) {
  const catalog = value.imageCatalog;
  const eligible = value.eligibleImageIndexes;
  if (!catalog?.length || !eligible?.length) {
    ctx.addIssue({ code: 'custom', message: '新版流程需要 imageCatalog 和 eligibleImageIndexes' });
    return;
  }
  const indexes = new Set(catalog.map((image) => image.index));
  if (indexes.size !== catalog.length || new Set(eligible).size !== eligible.length || eligible.some((index) => !indexes.has(index))) {
    ctx.addIssue({ code: 'custom', message: '商品图编号重复或允许编号不在目录中' });
  }
}

export const videoSalesPlannedAssetSchema = z.object({
  id: z.string().trim().min(1), kind: z.enum(['person', 'face', 'scene', 'keyframe']),
  label: z.string().trim().min(1), prompt: z.string().trim().min(1), required: z.boolean(),
  referenceAssetIds: z.array(z.string().min(1)).optional(), usesProduct: z.boolean().optional(),
  productImageIndexes: z.array(z.number().int().nonnegative()).optional(),
}).superRefine((value, ctx) => {
  const indexes = value.productImageIndexes ?? [];
  if (value.usesProduct && !indexes.length) ctx.addIssue({ code: 'custom', message: '商品素材需要明确的商品参考编号' });
  if ((!value.usesProduct && indexes.length) || new Set(indexes).size !== indexes.length) ctx.addIssue({ code: 'custom', message: '商品参考编号与用途不符或存在重复' });
});
export const videoSalesActualReferenceSchema = z.object({
  id: z.string().trim().min(1), kind: z.enum(['product', 'person', 'face', 'scene', 'keyframe']),
  label: z.string().trim().min(1), url: z.string().trim().min(1),
});
export const videoSalesScriptPlanSchema = z.object({
  deliveryMode: z.literal('single'), assets: z.array(videoSalesPlannedAssetSchema).min(1).max(4),
}).passthrough().superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const asset of value.assets) {
    const dependencies = asset.referenceAssetIds ?? [];
    if (seen.has(asset.id) || new Set(dependencies).size !== dependencies.length || dependencies.some((id) => !seen.has(id))) {
      ctx.addIssue({ code: 'custom', message: '素材依赖必须有序、唯一且无循环' });
    }
    seen.add(asset.id);
  }
});

export const videoSalesAnalyzeBodySchema = z.object({
  ...modelFields, ...workflowFields, imageCatalog: catalogSchema,
  productName: z.string().min(1), brand: z.string().optional(),
  productDescription: z.string().max(4000).optional(), category: categorySchema,
}).strict().superRefine(checkCatalog);
export type VideoSalesAnalyzeBody = z.infer<typeof videoSalesAnalyzeBodySchema>;

export const videoSalesScriptGenerateBodySchema = z.object({
  ...modelFields, ...workflowFields, imageCatalog: catalogSchema,
  productName: z.string().min(1, '商品名称不能为空').max(100), brand: z.string().optional(),
  category: categorySchema, productDescription: z.string().max(4000).optional(),
  productAnalysis: z.string().max(8000).optional(),
  videoMode: z.enum(['product_closeup', 'graphic_montage', 'scene_demo', 'live_presenter']).default('live_presenter'),
  targetDuration: z.number().int().min(10).max(120), aspectRatio: aspectRatioSchema,
  targetAudience: z.string().max(200).optional(),
}).strict().superRefine(checkCatalog);
export type VideoSalesScriptGenerateBody = z.infer<typeof videoSalesScriptGenerateBodySchema>;

const shotSchema = z.object({
  shotId: z.number().int().positive(), imageIndex: z.number().int().nonnegative(),
  duration: z.number().int().positive().optional(), description: z.string().optional(), camera: z.string().optional(),
  speechMode: z.enum(['on_camera', 'voiceover']),
  voiceover: z.string().trim().min(1), prompt: z.string().optional(), visualSource: z.string().optional(),
});
export const videoSalesSelectBodySchema = z.object({
  ...modelFields, ...workflowFields, imageCatalog: catalogSchema,
  shots: z.array(shotSchema.omit({ imageIndex: true }).extend({ type: z.string().optional() })).min(1).max(40),
}).strict().superRefine(checkCatalog);

export const videoSalesFinalizeBodySchema = z.object({
  ...modelFields, ...workflowFields,
  operation: z.literal('finalize'),
  shots: z.array(shotSchema).min(1).max(40), imageCatalog: catalogSchema,
  actualReferences: z.array(videoSalesActualReferenceSchema).min(1).max(44),
  assets: z.array(videoSalesPlannedAssetSchema).min(1).max(4),
  targetDuration: z.number().int().min(10).max(120), aspectRatio: aspectRatioSchema,
  videoModel: z.string().optional(), videoRefMode: z.string().optional(), videoResolution: z.string().optional(),
  productAnalysis: z.string().max(8000).optional(), category: categorySchema,
  productDescription: z.string().max(4000).optional(),
}).strict().superRefine((value, ctx) => {
  checkCatalog(value, ctx);
  const allowed = new Set(value.eligibleImageIndexes);
  if (value.shots.some((shot) => !allowed.has(shot.imageIndex))) ctx.addIssue({ code: 'custom', message: '分镜引用了不允许的图片' });
  const ids = value.actualReferences?.map((ref) => ref.id) ?? [];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: '实际参考ID重复' });
  if (value.operation === 'finalize' && (!value.targetDuration || !value.aspectRatio || value.shots.some((shot) => !shot.duration) || value.shots.reduce((sum, shot) => sum + (shot.duration ?? 0), 0) !== value.targetDuration)) {
    ctx.addIssue({ code: 'custom', message: '需要明确画幅且分镜总时长精确匹配目标时长' });
  }
});
export type VideoSalesFinalizeBody = z.infer<typeof videoSalesFinalizeBodySchema>;

export const videoSalesFinalizeResponseSchema = z.object({
  success: z.literal(true), fullPrompt: z.string().min(1),
  prompts: z.array(z.object({ shotId: z.number().int().positive(), speechMode: z.enum(['on_camera', 'voiceover']), prompt: z.string().min(1) })).min(1),
  model: z.string().optional(), usage: z.unknown().optional(),
});
