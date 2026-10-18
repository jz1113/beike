import { z } from 'zod';

export const PptCreationTypeSchema = z.enum(['idea', 'outline', 'descriptions']);
export type PptCreationType = z.infer<typeof PptCreationTypeSchema>;

export const PptLanguageSchema = z.enum(['zh', 'en', 'ja', 'auto']);
export type PptLanguage = z.infer<typeof PptLanguageSchema>;

export const PptAspectRatioSchema = z.enum(['16:9', '4:3', '3:4', '9:16']);
export type PptAspectRatio = z.infer<typeof PptAspectRatioSchema>;

export const PptDetailLevelSchema = z.enum(['concise', 'default', 'detailed']);
export type PptDetailLevel = z.infer<typeof PptDetailLevelSchema>;

export const PptStageSchema = z.enum(['input', 'outline', 'detail', 'studio']);
export type PptStage = z.infer<typeof PptStageSchema>;

export const PptBoundingBoxSchema = z.object({
  x: z.number(), // 0 - 100 百分比
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type PptBoundingBox = z.infer<typeof PptBoundingBoxSchema>;

export const PptSlideVersionSchema = z.object({
  id: z.string(),
  url: z.string(),
  prompt: z.string().optional(),
  editInstruction: z.string().optional(),
  bbox: PptBoundingBoxSchema.optional(),
  createdAt: z.number(),
});
export type PptSlideVersion = z.infer<typeof PptSlideVersionSchema>;

export const PptOutlinePageSchema = z.object({
  pageIndex: z.number(),
  title: z.string(),
  takeaway: z.string().optional(),
  points: z.array(z.string()).default([]),
  part: z.string().optional(),
});
export type PptOutlinePage = z.infer<typeof PptOutlinePageSchema>;

export const PptOutlineSectionSchema = z.object({
  part: z.string(),
  pages: z.array(PptOutlinePageSchema),
});
export type PptOutlineSection = z.infer<typeof PptOutlineSectionSchema>;

export const PptPageDetailSchema = z.object({
  pageIndex: z.number(),
  title: z.string(),
  contentText: z.string(), // 页面文字（逐字渲染）
  visualAssets: z.string().optional(), // 配图与素材
  layoutEmphasis: z.string().optional(), // 版式与重点
  speakerNotes: z.string().optional(), // 演讲者备注
  templateId: z.string().optional(),
  customStyle: z.string().optional(),
});
export type PptPageDetail = z.infer<typeof PptPageDetailSchema>;

export const PptReferenceFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  size: z.number().optional(),
  type: z.string().optional(),
  extractedText: z.string().optional(),
  extractedImages: z.array(z.string()).default([]),
});
export type PptReferenceFile = z.infer<typeof PptReferenceFileSchema>;

export const PptTemplateItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  previewUrl: z.string(),
  styleDescription: z.string(),
  themeColor: z.string().optional(),
  category: z.string().optional(),
});
export type PptTemplateItem = z.infer<typeof PptTemplateItemSchema>;

export const PptSlidePageSchema = z.object({
  id: z.string(),
  pageIndex: z.number(),
  title: z.string(),
  outline: PptOutlinePageSchema,
  detail: PptPageDetailSchema,
  currentVersionId: z.string().optional(),
  versions: z.array(PptSlideVersionSchema).default([]),
  narrationText: z.string().optional(),
  narrationAudioUrl: z.string().optional(),
  narrationDurationSeconds: z.number().optional(),
  isGenerating: z.boolean().default(false),
  error: z.string().optional(),
});
export type PptSlidePage = z.infer<typeof PptSlidePageSchema>;

export const PptProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  creationType: PptCreationTypeSchema.default('idea'),
  ideaPrompt: z.string().default(''),
  outlineText: z.string().default(''),
  descriptionText: z.string().default(''),
  language: PptLanguageSchema.default('zh'),
  aspectRatio: PptAspectRatioSchema.default('16:9'),
  detailLevel: PptDetailLevelSchema.default('default'),
  stage: PptStageSchema.default('input'),
  templateId: z.string().optional(),
  styleDescription: z.string().default(''),
  referenceFiles: z.array(PptReferenceFileSchema).default([]),
  outlinePages: z.array(PptOutlinePageSchema).default([]),
  pages: z.array(PptSlidePageSchema).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type PptProject = z.infer<typeof PptProjectSchema>;

// API 请求与响应结构
export const PptGenerateOutlineReqSchema = z.object({
  creationType: PptCreationTypeSchema,
  ideaPrompt: z.string().optional(),
  outlineText: z.string().optional(),
  referenceFiles: z.array(PptReferenceFileSchema).optional(),
  language: PptLanguageSchema.default('zh'),
  requirements: z.string().optional(),
});
export type PptGenerateOutlineReq = z.infer<typeof PptGenerateOutlineReqSchema>;

export const PptRefineOutlineReqSchema = z.object({
  currentOutline: z.array(PptOutlinePageSchema),
  userRequirement: z.string(),
  language: PptLanguageSchema.default('zh'),
});
export type PptRefineOutlineReq = z.infer<typeof PptRefineOutlineReqSchema>;

export const PptGenerateDescriptionsReqSchema = z.object({
  ideaPrompt: z.string().optional(),
  outlinePages: z.array(PptOutlinePageSchema),
  language: PptLanguageSchema.default('zh'),
  detailLevel: PptDetailLevelSchema.default('default'),
  referenceFiles: z.array(PptReferenceFileSchema).optional(),
  requirements: z.string().optional(),
});
export type PptGenerateDescriptionsReq = z.infer<typeof PptGenerateDescriptionsReqSchema>;

export const PptGenerateSlideReqSchema = z.object({
  pageIndex: z.number(),
  pageDesc: z.string(),
  outlineTitle: z.string(),
  aspectRatio: PptAspectRatioSchema.default('16:9'),
  templateImageUrl: z.string().optional(),
  pageStyleText: z.string().optional(),
  materialImageUrls: z.array(z.string()).optional(),
  language: PptLanguageSchema.default('zh'),
  modelId: z.string().optional(),
});
export type PptGenerateSlideReq = z.infer<typeof PptGenerateSlideReqSchema>;

export const PptInpaintSlideReqSchema = z.object({
  pageIndex: z.number(),
  originalImageUrl: z.string(),
  editInstruction: z.string(),
  editMode: z.enum(['inpaint', 'replace', 'erase']).default('inpaint'),
  bbox: PptBoundingBoxSchema.optional(),
  originalDescription: z.string().optional(),
  materialImageUrl: z.string().optional(),
});
export type PptInpaintSlideReq = z.infer<typeof PptInpaintSlideReqSchema>;

export const PptNarrationReqSchema = z.object({
  pages: z.array(z.object({
    pageIndex: z.number(),
    title: z.string(),
    contentText: z.string(),
    speakerNotes: z.string().optional(),
  })),
  speakerPersona: z.string().optional(),
  targetAudience: z.string().optional(),
  tone: z.string().optional(),
  language: PptLanguageSchema.default('zh'),
});
export type PptNarrationReq = z.infer<typeof PptNarrationReqSchema>;

export const PptExportReqSchema = z.object({
  exportType: z.enum(['pptx_images', 'pptx_editable', 'pdf', 'video_narration']),
  pages: z.array(z.object({
    pageIndex: z.number(),
    imageUrl: z.string(),
    title: z.string(),
    contentText: z.string().optional(),
    narrationText: z.string().optional(),
    audioUrl: z.string().optional(),
  })),
  aspectRatio: PptAspectRatioSchema.default('16:9'),
  transition: z.string().optional(),
});
export type PptExportReq = z.infer<typeof PptExportReqSchema>;
