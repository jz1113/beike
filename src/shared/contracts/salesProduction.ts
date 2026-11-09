import { z } from 'zod';

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
