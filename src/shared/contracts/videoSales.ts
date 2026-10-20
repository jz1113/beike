import { z } from 'zod';
import { TextRequestRoutingFields } from './textRouting';

export const videoSalesCatalogImageSchema = z.object({
  index: z.number().int().nonnegative(), url: z.string().min(1), role: z.string().min(1),
});
const categorySchema = z.enum(['beauty', 'food', 'home', 'fashion', 'tech', 'other']);
const aspectRatioSchema = z.enum(['9:16', '16:9', '3:4', '4:3', '1:1', '21:9']);
const modelFields = {
  ...TextRequestRoutingFields,
  model: z.string().optional(), customBaseUrl: z.string().optional(), customApiKey: z.string().optional(),
};
const workflowFields = {
  workflowVersion: z.literal(3).optional(),
  eligibleImageIndexes: z.array(z.number().int().nonnegative()).min(1).max(40).optional(),
  selectedColor: z.string().max(200).optional(),
};
const catalogSchema = z.array(videoSalesCatalogImageSchema).min(1).max(40);

function checkCatalog(value: {
  workflowVersion?: 3; eligibleImageIndexes?: number[];
  imageCatalog?: Array<{ index: number; url: string }>;
}, ctx: z.RefinementCtx) {
  if (value.workflowVersion !== 3) return;
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
});
export const videoSalesActualReferenceSchema = z.object({
  id: z.string().trim().min(1), kind: z.enum(['product', 'person', 'face', 'scene', 'keyframe']),
  label: z.string().trim().min(1), url: z.string().trim().min(1),
});
export const videoSalesAssetValidationSchema = z.object({
  id: z.string().min(1), status: z.enum(['passed', 'conflict', 'uncertain']), reason: z.string().trim().min(1),
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
  ...modelFields, ...workflowFields,
  imageUrls: z.array(z.string().min(1)).max(40).optional(),
  imageCatalog: catalogSchema.optional(), productName: z.string().optional(),
  brand: z.string().optional(), priceRange: z.string().optional(),
  productDescription: z.string().max(4000).optional(), category: z.string().optional(),
}).superRefine(checkCatalog);
export type VideoSalesAnalyzeBody = z.infer<typeof videoSalesAnalyzeBodySchema>;

export const videoSalesScriptGenerateBodySchema = z.object({
  ...modelFields, ...workflowFields, imageCatalog: catalogSchema.optional(),
  productName: z.string().min(1, '商品名称不能为空').max(100), brand: z.string().optional(),
  category: categorySchema.default('beauty'), productDescription: z.string().max(2000).optional(),
  productImages: z.array(z.string()).max(10).optional(), productAnalysis: z.string().max(4000).optional(),
  videoMode: z.enum(['product_closeup', 'graphic_montage', 'scene_demo', 'live_presenter']).default('product_closeup'),
  targetDuration: z.number().int().min(10).max(120).optional(), aspectRatio: aspectRatioSchema.optional(),
  priceRange: z.string().max(100).optional(), targetAudience: z.string().max(200).optional(),
  platforms: z.array(z.string()).optional(), templateId: z.string().max(100).optional(), characterId: z.string().max(100).optional(),
  fashionReferences: z.object({ person: z.boolean(), face: z.boolean(), scene: z.boolean() }).optional(),
}).superRefine((value, ctx) => {
  checkCatalog(value, ctx);
  if (value.workflowVersion === 3 && (!value.aspectRatio || !value.targetDuration)) ctx.addIssue({ code: 'custom', message: '新版脚本需要 targetDuration 和 aspectRatio' });
}).transform((value) => ({ ...value, targetDuration: value.targetDuration ?? 15 }));
export type VideoSalesScriptGenerateBody = z.infer<typeof videoSalesScriptGenerateBodySchema>;

export const videoSalesComposeClipSchema = z.object({
  type: z.enum(['video', 'image']), filePath: z.string().min(1), duration: z.number().positive(),
  transition: z.enum(['ai_start_end', 'ai_reference', 'direct_concat', 'ffmpeg_fade']).default('direct_concat'),
  motion: z.enum(['zoom_in_slow', 'zoom_out_slow', 'pan_left', 'pan_right', 'ken_burns', 'static']).optional(),
  hasAudio: z.boolean().optional(), voiceover: z.string().optional(), audioUrl: z.string().optional(),
});
export const videoSalesComposeBodySchema = z.object({
  projectId: z.string().min(1), clips: z.array(videoSalesComposeClipSchema).min(1),
  output: z.object({
    resolution: z.enum(['720p', '1080p']).default('1080p'), aspectRatio: z.enum(['9:16', '16:9', '3:4', '1:1']).default('9:16'),
    bgmPath: z.string().optional(), bgmVolume: z.number().min(0).max(1).default(0.3),
  }),
  subtitles: z.array(z.object({ text: z.string(), startTime: z.number(), endTime: z.number() })).optional(),
});
export type VideoSalesComposeBody = z.infer<typeof videoSalesComposeBodySchema>;

const shotSchema = z.object({
  shotId: z.number().int().positive(), imageIndex: z.number().int().nonnegative(),
  duration: z.number().int().positive().optional(), description: z.string().optional(), camera: z.string().optional(),
  voiceover: z.string().optional(), prompt: z.string().optional(), visualSource: z.string().optional(),
});
export const videoSalesSelectBodySchema = z.object({
  ...modelFields, ...workflowFields, imageCatalog: catalogSchema,
  shots: z.array(shotSchema.omit({ imageIndex: true }).extend({ type: z.string().optional() })).min(1).max(40),
}).superRefine(checkCatalog);

export const videoSalesFinalizeBodySchema = z.object({
  ...modelFields, ...workflowFields,
  operation: z.enum(['validate-assets', 'finalize']).optional(),
  shots: z.array(shotSchema).min(1).max(40), imageCatalog: catalogSchema,
  actualReferences: z.array(videoSalesActualReferenceSchema).min(1).max(44).optional(),
  assets: z.array(videoSalesPlannedAssetSchema).min(1).max(4).optional(),
  targetDuration: z.number().int().min(10).max(120).optional(), aspectRatio: aspectRatioSchema.optional(),
  videoModel: z.string().optional(), videoRefMode: z.string().optional(), videoResolution: z.string().optional(),
  productAnalysis: z.string().max(8000).optional(), category: categorySchema.optional(),
  referenceOrder: z.array(z.object({
    slot: z.enum(['person', 'face', 'garment', 'scene']), label: z.string().min(1), url: z.string().min(1),
    imageIndex: z.number().int().nonnegative().optional(),
  })).max(4).optional(),
}).superRefine((value, ctx) => {
  checkCatalog(value, ctx);
  if (value.operation && value.workflowVersion !== 3) ctx.addIssue({ code: 'custom', message: 'operation 需要 workflowVersion:3' });
  if (value.workflowVersion !== 3) return;
  if (!value.operation || !value.actualReferences?.length) ctx.addIssue({ code: 'custom', message: '新版定稿需要 operation 和 actualReferences' });
  const allowed = new Set(value.eligibleImageIndexes);
  if (value.shots.some((shot) => !allowed.has(shot.imageIndex))) ctx.addIssue({ code: 'custom', message: '分镜引用了不允许的图片' });
  const ids = value.actualReferences?.map((ref) => ref.id) ?? [];
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: '实际参考ID重复' });
  if (value.operation === 'finalize' && (!value.targetDuration || !value.aspectRatio || value.shots.some((shot) => !shot.duration) || value.shots.reduce((sum, shot) => sum + (shot.duration ?? 0), 0) !== value.targetDuration)) {
    ctx.addIssue({ code: 'custom', message: '需要明确画幅且分镜总时长精确匹配目标时长' });
  }
});
export type VideoSalesFinalizeBody = z.infer<typeof videoSalesFinalizeBodySchema>;

export const videoSalesValidateAssetsResponseSchema = z.object({
  success: z.literal(true), validations: z.array(videoSalesAssetValidationSchema).min(1), model: z.string().optional(),
});
export const videoSalesFinalizeResponseSchema = z.object({
  success: z.literal(true), fullPrompt: z.string().min(1),
  prompts: z.array(z.object({ shotId: z.number().int().positive(), prompt: z.string().min(1) })).min(1),
  model: z.string().optional(),
});
