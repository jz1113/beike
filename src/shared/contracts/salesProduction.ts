import { z } from 'zod';
import { TextRequestRoutingFields } from './textRouting';
import { salesVisualSpecSchema } from './salesScripts';

export const studioPersonaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  tags: z.string().default(''),
  dimensions: z.string().default(''),
  identityUrl: z.string().optional(),
  avatarUrl: z.string().default(''),
  fullBodyUrl: z.string().default(''),
  faceUrl: z.string().default(''),
  sourceImages: z.array(z.string()).default([]),
  hasReferenceImage: z.boolean().default(false),
  source: z.string().default('persona_library'),
  defaultVoiceId: z.string().optional(),
});

export const studioSceneSchema = z.object({
  dimensions: z.string().default(''),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  lighting: z.string().default(''),
  category: z.string().default(''),
  spatialType: z.string().default('indoor_room'),
  tags: z.string().default(''),
  suitableCategories: z.array(z.string()).default([]),
  coverUrl: z.string().default(''),
  sourceImages: z.array(z.string()).default([]),
  source: z.string().default('scene_library'),
});

export const studioVoiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  voiceId: z.string().default(''),
  ttsVoice: z.string().default(''),
  gender: z.string().default('female'),
  voiceGroup: z.string().default(''),
  tags: z.array(z.string()).default([]),
  sampleAudioUrl: z.string().default(''),
  promptText: z.string().default(''),
  source: z.string().default('voice_library'),
});

export const studioBgmSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  moodTags: z.array(z.string()).default([]),
  bpm: z.number().int().min(30).max(240).default(100),
  durationSec: z.number().min(1).default(12),
  suitableCategories: z.array(z.string()).default([]),
  license: z.string().default('CC0-1.0'),
  audioUrl: z.string().min(1),
  source: z.string().default(''),
  editable: z.boolean().default(false),
});

export const studioActionSchema = z.object({
  mediaType: z.enum(['image', 'video', 'depth-image', 'depth-video']).default('image'),
  mediaUrl: z.string().default(''),
  sourceUrl: z.string().default(''),
  sourceImages: z.array(z.string()).default([]),
  dimensions: z.string().default(''),
  productCategoryIds: z.array(z.string()).default([]),
  categoryId: z.string().default(''),
  id: z.string().min(1),
  title: z.string().min(1),
  action: z.string().default(''),
  shotType: z.string().default(''),
  camera: z.string().default(''),
  tags: z.string().default(''),
  coverUrl: z.string().default(''),
});

export const salesStudioAssetsResponseSchema = z.object({
  success: z.literal(true),
  personas: z.array(studioPersonaSchema).default([]),
  scenes: z.array(studioSceneSchema).default([]),
  actions: z.array(studioActionSchema).default([]),
  voices: z.array(studioVoiceSchema).default([]),
  bgms: z.array(studioBgmSchema).default([]),
});

export const salesPlanAdaptBeatInputSchema = z.object({
  preservePerformance: z.boolean().optional(),
  index: z.number().int().min(0),
  shotIndex: z.number().int().min(0),
  start: z.number().min(0),
  end: z.number().min(0),
  purpose: z.string(),
  shotSize: z.string(),
  camera: z.string(),
  refAction: z.string(),
  productVisible: z.boolean().optional(),
  subject: z.string().max(1000).optional(),
  scene: z.string().max(600).optional(),
  transition: z.string().max(400).optional(),
  expression: z.string().max(600).optional(),
  requiredView: z.string(),
  assignedView: z.string(),
  imageLabel: z.string(),
  buyingPoint: z.string(),
  actionReference: z.string().max(1000).optional(),
  sourceVoiceText: z.string().max(1000).optional(),
  sourceLinePattern: z.string().max(600).optional(),
  sourceSubtitle: z.string().max(400).optional(),
});

export const salesPlanAdaptBodySchema = z.object({
  allowProductReframe: z.boolean().optional(),
  narration: z.object({ sourceCopy: z.string().max(10000), duration: z.number().positive().max(600), targetCps: z.number().min(2).max(4.6) }).optional(),
  unresolved: z.array(z.string().max(1000)).max(9).optional(),
  productName: z.string().max(2000),
  brand: z.string().max(500).default(''),
  category: z.string().max(120).default('other'),
  summary: z.string().max(2000).default(''),
  facts: z.string().max(20_000).default(''),
  buyingPoints: z.array(z.string().max(1000)).max(12).default([]),
  cautions: z.array(z.string().max(1000)).max(12).default([]),
  scriptTitle: z.string().max(200).default(''),
  oneTake: z.boolean().default(false),
  visualSpec: salesVisualSpecSchema.optional(),
  voiceMode: z.enum(['speech', 'voiceover', 'none']).default('speech'),
  presentationMode: z.enum(['subtitled_intro', 'clean_visual']).default('subtitled_intro'),
  imitationMode: z.enum(['script_only', 'depth_imitation']).default('script_only'),
  personaSummary: z.string().max(1000).default(''),
  personaReferenceImageUrl: z.string().trim().min(1).max(8192).optional(),
  personaPresence: z.enum(['full_presenter', 'silent_model', 'hands_only', 'none']).optional(),
  sceneSummary: z.string().max(1000).default(''),
  sourceExclusions: z.array(z.union([
    z.string().max(200),
    z.object({ term: z.string().trim().min(1).max(200), type: z.string().trim().min(1).max(80) }),
  ])).max(40).default([]),
  beats: z.array(salesPlanAdaptBeatInputSchema).min(1).max(24),
  model: z.string().trim().min(1).max(200),
  ...TextRequestRoutingFields,
  customBaseUrl: z.string().max(8192).optional(),
  customApiKey: z.string().max(8192).optional(),
  apiFormat: z.literal('openai-responses').optional(),
  allowInsecureHttp: z.boolean().optional(),
});

export const salesAdaptedBeatSchema = z.object({
  index: z.number().int().min(0),
  subject: z.string().default(''),
  action: z.string().min(1),
  expression: z.string().max(600).optional(),
  transition: z.string().max(400).optional(),
  spokenLine: z.string().default(''),
  subtitle: z.string().default(''),
});

export const salesPlanAdaptResponseSchema = z.object({
  personaVisualProfile: z.object({
    imageUrl: z.string().trim().min(1).max(8192),
    presence: z.enum(['full_presenter', 'silent_model', 'hands_only']),
    temperament: z.string().max(600),
    gaze: z.string().max(600),
    expression: z.string().max(600),
    posture: z.string().max(600),
    limitations: z.string().max(600),
  }).refine(profile => [profile.temperament, profile.gaze, profile.expression, profile.posture].some(value => value.trim()), '人物原图视觉分析为空').optional(),
  spokenCopyPromptVersion: z.string().optional(),
  success: z.literal(true),
  beats: z.array(salesAdaptedBeatSchema).min(1),
  model: z.string().default(''),
  promptVersion: z.string().default(''),
});

export const salesAudioMixBodySchema = z.object({
  videoUrl: z.string().trim().min(1).max(8192),
  voiceMode: z.enum(['speech', 'voiceover', 'none']).default('voiceover'),
  voiceoverUrl: z.string().max(8192).optional(),
  bgmId: z.string().max(120).optional(),
  bgmUrl: z.string().max(8192).optional(),
  bgmVolume: z.number().min(0).max(1.2).optional(),
  keepOriginalAudio: z.boolean().optional(),
});

export const salesAudioMixResponseSchema = z.object({
  success: z.literal(true),
  videoUrl: z.string().min(1),
  durationSec: z.number().min(0),
  duckedBgm: z.boolean().default(false),
});

export const salesVideoReviewResponseSchema = z.object({
  success: z.literal(true),
  picture: z.enum(['visible', 'dark', 'unreadable']),
  audio: z.enum(['audible', 'quiet', 'missing', 'unreadable']),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative(),
});
