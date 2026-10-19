import { z } from 'zod';

export const ImageTaskStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'SUCCESS',
  'FAILURE',
]);

export const ImageTaskSchema = z.object({
  id: z.string(),
  productId: z.string().nullable().optional(),
  prompt: z.string(),
  taskId: z.string().nullable().optional(),
  status: ImageTaskStatusSchema,
  resultUrl: z.string().nullable().optional(),
  failReason: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  mediaType: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  quality: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.number(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.number(), z.date()]).optional(),
}).passthrough();

export const AssetTasksListResponseSchema = z.object({
  success: z.boolean().optional(),
  tasks: z.array(ImageTaskSchema).optional(),
  items: z.array(ImageTaskSchema).optional(),
  total: z.number().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
});

export type ImageTask = z.infer<typeof ImageTaskSchema>;
export type AssetTasksListResponse = z.infer<typeof AssetTasksListResponseSchema>;

export const GenerationMediaTypeSchema = z.enum(['image', 'video', 'depth-image', 'depth-video', 'agent', 'audio']);
export const GenerationTaskSchema = z.object({
  id: z.string(),
  batchId: z.string().optional(),
  shotNo: z.number().optional(),
  title: z.string(),
  prompt: z.string(),
  scene: z.string().optional(),
  camera_focal_length: z.string().optional(),
  angle: z.string().optional(),
  lighting_type: z.string().optional(),
  expression: z.string().optional(),
  action: z.string().optional(),
  model: z.string(),
  size: z.string(),
  quality: z.string(),
  imageQuality: z.string().optional(),
  inferenceStrength: z.string().optional(),
  has_human: z.boolean().optional(),
  shot_type: z.enum(['model_shot', 'hand_held_only', 'pure_product']).optional(),
  mediaType: GenerationMediaTypeSchema.optional(),
  depthStyle: z.string().optional(),
  videoDuration: z.number().optional(),
  videoResolution: z.string().optional(),
  videoRefMode: z.string().optional(),
  generateAudio: z.boolean().optional(),
  productImageUrl: z.string().optional(),
  referenceImageUrl: z.string().optional(),
  referenceImages: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  useReferenceImage: z.boolean(),
  taskType: z.enum(['multi_angle', 'smart_edit', 'outpaint', 'generation']).optional(),
  angleName: z.string().optional(),
  sourceImageUrl: z.string().optional(),
  status: z.enum(['IDLE', 'IN_PROGRESS', 'SUCCESS', 'FAILURE']),
  progress: z.string(),
  taskId: z.string().optional(),
  dbId: z.string().optional(),
  resultUrl: z.string().optional(),
  failReason: z.string().optional(),
  createdAt: z.number().optional(),
  sessionId: z.string().optional(),
  sessionTitle: z.string().optional(),
});
export type GenerationTask = z.infer<typeof GenerationTaskSchema>;
export type GenerationMediaType = z.infer<typeof GenerationMediaTypeSchema>;

export const DepthVideoStyleSchema = z.enum(['mocap', 'turbo', 'raw']);
export const DepthVideoColormapSchema = z.enum(['gray', 'turbo']);
export const DepthQualitySchema = z.enum(['fast', 'standard', 'high']);

export const DepthVideoSubmitBodySchema = z.object({
  videoDataUrl: z.string().min(1).optional(),
  videoUrl: z.string().min(1).optional(),
  style: DepthVideoStyleSchema.optional().default('mocap'),
  colormap: DepthVideoColormapSchema.optional(),
  quality: DepthQualitySchema.optional().default('standard'),
}).refine((body) => Boolean(body.videoDataUrl?.trim() || body.videoUrl?.trim()), {
  message: '请提供 videoDataUrl 或 videoUrl',
});

export const DepthVideoSubmitResponseSchema = z.object({
  success: z.boolean(),
  taskId: z.string().optional(),
  recordId: z.string().optional(),
  status: z.string().optional(),
  error: z.string().optional(),
});

export const DepthVideoPollResponseSchema = z.object({
  success: z.boolean(),
  taskId: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILURE']).optional(),
  progress: z.string().optional(),
  stage: z.string().optional(),
  resultUrl: z.string().nullable().optional(),
  failReason: z.string().nullable().optional(),
  error: z.string().optional(),
});

export type DepthVideoSubmitBody = z.infer<typeof DepthVideoSubmitBodySchema>;
export type DepthVideoSubmitResponse = z.infer<typeof DepthVideoSubmitResponseSchema>;
export type DepthVideoPollResponse = z.infer<typeof DepthVideoPollResponseSchema>;

export const DepthImageResponseSchema = z.object({
  success: z.boolean(),
  resultUrl: z.string().optional(),
  style: DepthVideoStyleSchema.optional(),
  quality: DepthQualitySchema.optional(),
  modelId: z.string().optional(),
  inferenceSizePx: z.number().optional(),
  device: z.string().optional(),
  error: z.string().optional(),
});

export type DepthImageResponse = z.infer<typeof DepthImageResponseSchema>;

export const HeadlineAspectRatioSchema = z.enum(['3:4', '1:1']);

const HeadlineModelSchema = z.string().trim().max(160).optional();
const HeadlineInputTitleSchema = z.string().trim().max(2000, '标题最多 2000 字').optional();
const HeadlineProductNameSchema = z.string().max(128).transform((name) => name.replace(/\s+/g, ' ').trim())
  .pipe(z.string().max(64, '商品名称/型号最多 64 字')).optional();
// 25 MiB originals fit within this base64 limit; remote and local URLs are also accepted.
const HeadlineImageSchema = z.string().trim().min(1).max(36 * 1024 * 1024, '商品图片数据过大');
const HeadlineCredentials = {
  customBaseUrl: z.string().trim().max(2048).optional(),
  customApiKey: z.string().trim().max(4096).optional(),
};

export const HeadlineDesignRequestSchema = z.object({
  model: HeadlineModelSchema,
  originalTitle: HeadlineInputTitleSchema,
  coverTitle: HeadlineInputTitleSchema,
  productTitle: HeadlineInputTitleSchema,
  productName: HeadlineProductNameSchema,
  imageUrls: z.array(HeadlineImageSchema).min(1, '封面设计需要商品图片').max(2, '最多使用两张商品图片'),
  aspectRatio: HeadlineAspectRatioSchema.optional(),
  batchId: z.string().trim().max(128).optional(),
  itemId: z.string().trim().max(128).optional(),
  itemTitle: z.string().trim().max(200).optional(),
  previousDesign: z.string().trim().max(2000, '上一张设计摘要最多 2000 字').optional(),
  ...HeadlineCredentials,
});

export const HeadlineTitleRequestSchema = z.object({
  model: HeadlineModelSchema,
  originalTitle: HeadlineInputTitleSchema,
  productName: HeadlineProductNameSchema,
  imageUrls: z.array(HeadlineImageSchema).min(1, '标题改写需要商品图片').max(1, '标题改写只使用一张商品图片'),
  ...HeadlineCredentials,
});

export type HeadlineDesignRequest = z.infer<typeof HeadlineDesignRequestSchema>;
export type HeadlineTitleRequest = z.infer<typeof HeadlineTitleRequestSchema>;

export const KeywordReviewRowSchema = z.object({
  id: z.string().min(1).max(120),
  query: z.string().min(1).max(500),
  expansion: z.string().max(4000).optional(),
  entityExpansion: z.string().max(4000).optional(),
  contentType: z.string().max(500).optional(),
});

export const KeywordReviewRequestSchema = z.object({
  model: z.string().max(160).optional(),
  provider: z.enum(['deepseek', 'gateway']).optional(),
  reviewMode: z.enum(['image', 'video']).optional(),
  rows: z.array(KeywordReviewRowSchema).min(1).max(60).refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    '关键词行 id 不能重复',
  ),
  customBaseUrl: z.string().optional(),
  customApiKey: z.string().optional(),
  lookup: z.boolean().optional(),
  lookupBudget: z.number().int().min(0).max(100).optional(),
  rulesVersion: z.number().int().nonnegative().optional(),
});

export const KeywordReviewRuleEntrySchema = z.object({
  section: z.enum(['垂类边界', '不制作', '其他说明']),
  text: z.string().trim().min(4).max(300),
  mode: z.enum(['image', 'video']).optional(),
});

export const KeywordReviewRulesUpdateSchema = z.object({
  baseVersion: z.number().int().nonnegative(),
  entries: z.array(KeywordReviewRuleEntrySchema).max(30).refine(
    (entries) => entries.reduce((total, entry) => total + entry.text.length, 0) <= 6000,
    '补充规则总长度不能超过 6000 字',
  ),
  note: z.string().trim().min(2).max(200),
});

export type KeywordReviewRuleEntry = z.infer<typeof KeywordReviewRuleEntrySchema>;
export type KeywordReviewMode = 'image' | 'video';

export const KEYWORD_REVIEW_CATEGORIES = [
  '政史军', '3C数码', '本地生活', '动漫', '动物', '法律', '购物消费', '互联网IT', '家居',
  '交通出行', '教育', '金融财经', '科学技术', '旅游', '美食', '美术', '民俗文化', '其他', '汽车',
  '情感', '求职招聘', '软件工具', '社会', '时尚', '体育', '小说', '星座', '医疗健康', '音乐', '影视',
  '游戏', '娱乐', '政策政务', '植物',
] as const;

export const KEYWORD_VIDEO_CATEGORIES = [
  '财经', '健康', '法律', '教育', '宗教', '历史', '3C', '美食', '汽车', '时尚', '旅游',
  '动物', '体育', '娱乐', '植物', '民俗文化', '求职招聘', '办公效率', '家居', '游戏',
  '情感', '星座', '社会', '政务政策', '软件', '音乐', '房地产', '本地生活', '科学技术',
  '互联网 it', '姓氏 / 取名', '解梦', '交通', '小说', '电影', '电视剧', '动漫', '漫画',
  '综艺节目', '其他', '科技', '传统文化', '明星', '科普', '亲子', '职场', '摄影', '舞蹈',
] as const;

export const KEYWORD_REVIEW_REJECT_PREFIXES = [
  '简单问答',
  '低价值',
  '金融决策',
  '医疗诊疗',
  '敏感热点',
  '违法危险',
  '算命迷信',
  '工业硬广',
  '非笔记需求',
  '限制过细',
] as const;

export const KeywordReviewResultSchema = z.object({
  id: z.string(),
  category: z.string(),
  producible: z.enum(['制作', '不制作']),
  categoryReason: z.string().min(1).max(80),
  rejectReason: z.string().max(80),
  lowValue: z.enum(['是', '否']).optional(),
});

export const KeywordReviewBalanceRequestSchema = z.object({
  customBaseUrl: z.string().optional(),
  customApiKey: z.string().optional(),
});

export const KeywordReviewBalanceSchema = z.object({
  currency: z.enum(['CNY', 'USD']),
  total: z.string(),
  granted: z.string(),
  toppedUp: z.string(),
  available: z.boolean(),
});

export type KeywordReviewRow = z.infer<typeof KeywordReviewRowSchema>;
export type KeywordReviewRequest = z.infer<typeof KeywordReviewRequestSchema>;
export type KeywordReviewResult = z.infer<typeof KeywordReviewResultSchema>;
export type KeywordReviewBalanceRequest = z.infer<typeof KeywordReviewBalanceRequestSchema>;
export type KeywordReviewBalance = z.infer<typeof KeywordReviewBalanceSchema>;
