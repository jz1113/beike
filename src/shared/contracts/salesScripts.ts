import { z } from 'zod';
import { TextReasoningRoutingFields, TextRequestRoutingFields } from './textRouting';

export const salesProductViewSchema = z.enum(['front', 'back', 'detail', 'worn', 'flat']);
export const salesBeatRequiredViewSchema = z.enum(['front', 'back', 'detail', 'worn', 'flat', 'any']);
export const salesScriptFormatSchema = z.enum(['presenter', 'hands', 'product', 'mixed']);
export const salesScriptVoiceModeSchema = z.enum(['speech', 'voiceover', 'mixed', 'none']);
export const salesBeatVoiceModeSchema = z.enum(['speech', 'voiceover', 'none']);
export const salesBeatPurposeSchema = z.enum(['hook', 'showcase', 'proof', 'usage', 'closing', 'other']);
export const salesScriptStatusSchema = z.enum(['draft', 'verified', 'archived']);
export const salesAspectRatioSchema = z.enum(['9:16', '16:9', '3:4', '1:1']);
export const salesPacingSchema = z.enum(['fast', 'medium', 'slow']);
export const salesExclusionTypeSchema = z.enum([
  'product',
  'brand_signage',
  'person_appearance',
  'scene',
  'accessory',
  'copy_claim',
]);

export const salesBeatVoiceSchema = z.object({
  mode: salesBeatVoiceModeSchema.catch('none'),
  speaker: z.string().max(120).default(''),
  text: z.string().max(1000).default(''),
  linePattern: z.string().max(600).default(''),
  uncertain: z.boolean().default(false),
});

export const salesScriptBeatSchema = z.object({
  start: z.number().min(0).max(600),
  end: z.number().min(0).max(600),
  estimated: z.boolean().default(false),
  previewFrameUrl: z.string().max(4096).default(''),
  purpose: salesBeatPurposeSchema.catch('showcase'),
  shotSize: z.string().max(120).default('中景'),
  camera: z.string().max(500).default(''),
  subject: z.string().max(800).default(''),
  action: z.string().max(1500).default(''),
  actionTemplate: z.string().max(1500).default(''),
  productVisible: z.boolean().optional(),
  referenceActionRaw: z.string().max(1500).default(''),
  expression: z.string().max(600).default(''),
  scene: z.string().max(600).default(''),
  transition: z.string().max(400).default(''),
  requiredView: salesBeatRequiredViewSchema.catch('any'),
  voice: salesBeatVoiceSchema.default({}),
  subtitle: z.string().max(400).default(''),
  shows: z.string().max(800).default(''),
  sectionLabel: z.string().max(80).optional(),
  cameraLabel: z.string().max(80).optional(),
  inferred: z.array(z.string().max(500)).max(12).default([]),
});

export const salesScriptShotSchema = z.object({
  start: z.number().min(0).max(600),
  end: z.number().min(0).max(600),
  estimated: z.boolean().default(false),
  summary: z.string().max(500).default(''),
  analysis: z.object({
    style: z.string().max(300).optional(), subject: z.string().max(300).optional(), action: z.string().max(300).optional(),
    camera: z.string().max(300).optional(), expression: z.string().max(300).optional(),
  }).optional(),
  beats: z.array(salesScriptBeatSchema).min(1).max(24),
});

export const salesVisualSpecSchema = z.object({
  aspectRatio: salesAspectRatioSchema.catch('9:16'),
  oneTake: z.boolean().default(false),
  styleSummary: z.string().max(600).default(''),
  lighting: z.string().max(300).default(''),
  cameraFeel: z.string().max(300).default(''),
  moodTags: z.array(z.string().max(60)).max(12).default([]),
  pacing: salesPacingSchema.catch('medium'),
});

export const salesAssetSlotsSchema = z.object({
  productViews: z.array(salesProductViewSchema).max(5).default([]),
  persona: z.object({
    required: z.boolean().default(true),
    presence: z.enum(['full_presenter', 'silent_model', 'hands_only', 'none']).catch('full_presenter'),
    anchorsNeeded: z.array(z.enum(['full_body', 'face', 'hands'])).max(3).default(['full_body', 'face']),
    styleTags: z.array(z.string().max(80)).max(10).default([]),
  }).default({}),
  scene: z.object({
    spatialType: z.enum(['indoor', 'outdoor', 'studio']).catch('indoor'),
    categoryTags: z.array(z.string().max(100)).max(10).default([]),
    requiredZones: z.array(z.string().max(120)).max(10).default([]),
  }).default({}),
  audio: z.object({
    voiceMode: salesBeatVoiceModeSchema.catch('speech'),
    targetCps: z.number().min(0).max(10).default(3.8),
    voiceTags: z.array(z.string().max(80)).max(10).default([]),
    bgmRequired: z.boolean().default(true),
    bgmMoodTags: z.array(z.string().max(80)).max(10).default([]),
    bgmBpmRange: z.tuple([z.number().min(40).max(220), z.number().min(40).max(220)]).optional(),
  }).default({}),
});

export const salesSourceExclusionSchema = z.object({
  type: salesExclusionTypeSchema.catch('copy_claim'),
  term: z.string().trim().min(1).max(300),
  replacementRule: z.string().max(400).default(''),
});

export const salesScriptTaxonomySchema = z.object({
  categoryId: z.string().max(120).default(''),
  styleId: z.string().max(120).default(''),
  productCategory: z.enum(['fashion', 'beauty', 'food', 'home', 'tech', 'other']).catch('other'),
  subCategory: z.string().max(60).default(''),
  styleCategory: z.enum([
    'street_onetake',
    'lifestyle_vlog',
    'talking_head',
    'detail_proof',
    'studio_lookbook',
    'home_cozy',
  ]).catch('lifestyle_vlog'),
});

export const salesScriptTemplateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  durationSec: z.number().gt(0).max(600),
  format: salesScriptFormatSchema.catch('presenter'),
  voiceMode: salesScriptVoiceModeSchema.catch('speech'),
  audioAvailable: z.boolean().default(true),
  sampleTimesSec: z.array(z.number().nonnegative()).max(24).optional(),
  overview: z.string().max(1200).default(''),
  taxonomy: salesScriptTaxonomySchema.default({}),
  visualSpec: salesVisualSpecSchema.default({}),
  structure: z.object({
    hook: z.string().max(600).default(''),
    showcase: z.string().max(600).default(''),
    proof: z.string().max(600).default(''),
    closing: z.string().max(600).default(''),
  }).default({}),
  assetSlots: salesAssetSlotsSchema.default({}),
  shots: z.array(salesScriptShotSchema).min(1).max(40),
  sourceExclusions: z.array(salesSourceExclusionSchema).max(40).default([]),
  reusable: z.object({
    categories: z.array(z.string().max(60)).max(12).default([]),
    requiredViews: z.array(z.string().max(40)).max(8).default([]),
    requirements: z.array(z.string().max(400)).max(12).default([]),
    replaceable: z.array(z.string().max(400)).max(12).default([]),
    nonTransferable: z.array(z.string().max(400)).max(16).default([]),
  }).default({}),
  review: z.array(z.string().max(500)).max(20).default([]),
});

export const salesScriptVideoUploadResponseSchema = z.object({
  success: z.literal(true),
  videoUrl: z.string().min(1),
  videoHash: z.string().default(''),
  durationSec: z.number().min(0).default(0),
  aspectRatio: salesAspectRatioSchema.catch('9:16'),
  hasAudio: z.boolean().default(true),
  sizeBytes: z.number().int().min(0).default(0),
});

export const salesScriptAnalysisBodySchema = z.object({
  videoUrl: z.string().trim().min(1).max(8192),
  model: z.string().trim().min(1).max(200),
  force: z.boolean().optional(),
  includeDepth: z.boolean().optional(),
  depthOperationId: z.string().max(256).optional(),
  ...TextRequestRoutingFields,
  ...TextReasoningRoutingFields,
  customBaseUrl: z.string().max(8192).optional(),
  customApiKey: z.string().max(8192).optional(),
  apiFormat: z.literal('openai-responses').optional(),
  allowInsecureHttp: z.boolean().optional(),
});

export const salesScriptAnalysisResponseSchema = z.object({
  success: z.literal(true),
  script: salesScriptTemplateSchema,
  model: z.string().default(''),
  promptVersion: z.string().default(''),
  videoHash: z.string().default(''),
  existingId: z.string().optional(),
  saveWarning: z.string().optional(),
  cached: z.boolean().optional(),
});

export const salesScriptPromptResponseSchema = z.object({
  success: z.literal(true),
  prompt: z.string().min(1),
  promptVersion: z.string().min(1),
});

export const storedSalesScriptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  videoUrl: z.string().default(''),
  videoHash: z.string().default(''),
  depthVideoUrl: z.string().default(''),
  depthTaskId: z.string().default(''),
  depthOperationId: z.string().default(''),
  durationSec: z.number().gt(0),
  format: salesScriptFormatSchema.catch('presenter'),
  voiceMode: salesScriptVoiceModeSchema.catch('speech'),
  status: salesScriptStatusSchema.catch('draft'),
  script: salesScriptTemplateSchema,
  model: z.string().default(''),
  promptVersion: z.string().default(''),
  version: z.number().int().min(1).default(1),
  useCount: z.number().int().min(0).default(0),
  lastUsedAt: z.string().default(''),
  createdAt: z.string().default(''),
  updatedAt: z.string().default(''),
});

export const salesScriptListResponseSchema = z.object({
  success: z.literal(true),
  items: z.array(storedSalesScriptSchema),
});

export const salesScriptItemResponseSchema = z.object({
  success: z.literal(true),
  item: storedSalesScriptSchema,
});

export const saveSalesScriptBodySchema = z.object({
  id: z.string().max(120).optional(),
  title: z.string().trim().min(1).max(120),
  videoUrl: z.string().max(8192).default(''),
  videoHash: z.string().max(128).default(''),
  depthVideoUrl: z.string().max(8192).default(''),
  depthTaskId: z.string().max(256).default(''),
  depthOperationId: z.string().max(256).default(''),
  status: salesScriptStatusSchema.default('draft'),
  model: z.string().max(200).default(''),
  promptVersion: z.string().max(120).default(''),
  script: salesScriptTemplateSchema,
});

export const patchSalesScriptBodySchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
  videoUrl: z.string().max(8192).optional(),
  depthVideoUrl: z.string().max(8192).optional(),
  depthTaskId: z.string().max(256).optional(),
  depthOperationId: z.string().max(256).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  status: salesScriptStatusSchema.optional(),
  script: salesScriptTemplateSchema.optional(),
  recordUse: z.boolean().optional(),
});

export type SalesScriptTemplateContract = z.infer<typeof salesScriptTemplateSchema>;
export type StoredSalesScriptContract = z.infer<typeof storedSalesScriptSchema>;
export type SaveSalesScriptBody = z.infer<typeof saveSalesScriptBodySchema>;
export type PatchSalesScriptBody = z.infer<typeof patchSalesScriptBodySchema>;
