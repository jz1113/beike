import { z } from 'zod';

export const videoSalesAnalyzeBodySchema = z.object({
  imageUrls: z.array(z.string().min(1)).min(1).max(10),
  productName: z.string().optional(),
  category: z.string().optional(),
  model: z.string().optional(),
});

export type VideoSalesAnalyzeBody = z.infer<typeof videoSalesAnalyzeBodySchema>;

export const videoSalesScriptGenerateBodySchema = z.object({
  productName: z.string().min(1, '商品名称不能为空').max(100),
  category: z.enum(['beauty', 'food', 'home', 'fashion', 'tech', 'other']).default('beauty'),
  productDescription: z.string().max(2000).optional(),
  productImages: z.array(z.string()).max(10).optional(),
  productAnalysis: z.string().max(4000).optional(),
  videoMode: z.enum(['product_closeup', 'graphic_montage', 'scene_demo', 'live_presenter']).default('product_closeup'),
  styleType: z.enum(['pain_point', 'scene', 'comparison', 'story', 'unboxing', 'custom']).default('pain_point'),
  targetDuration: z.number().int().min(10).max(120).default(30),
  priceRange: z.string().max(100).optional(),
  targetAudience: z.string().max(200).optional(),
  platforms: z.array(z.string()).optional(),
  templateId: z.string().max(100).optional(),
  characterId: z.string().max(100).optional(),
});

export type VideoSalesScriptGenerateBody = z.infer<typeof videoSalesScriptGenerateBodySchema>;

export const videoSalesComposeClipSchema = z.object({
  type: z.enum(['video', 'image']),
  filePath: z.string().min(1),
  duration: z.number().positive(),
  transition: z.enum(['ai_start_end', 'ai_reference', 'direct_concat', 'ffmpeg_fade']).default('direct_concat'),
  motion: z.enum(['zoom_in_slow', 'zoom_out_slow', 'pan_left', 'pan_right', 'ken_burns', 'static']).optional(),
  hasAudio: z.boolean().optional(),
  voiceover: z.string().optional(),
  audioUrl: z.string().optional(),
});

export const videoSalesComposeBodySchema = z.object({
  projectId: z.string().min(1),
  clips: z.array(videoSalesComposeClipSchema).min(1),
  output: z.object({
    resolution: z.enum(['720p', '1080p']).default('1080p'),
    aspectRatio: z.enum(['9:16', '16:9', '3:4', '1:1']).default('9:16'),
    bgmPath: z.string().optional(),
    bgmVolume: z.number().min(0).max(1).default(0.3),
  }),
  subtitles: z.array(z.object({
    text: z.string(),
    startTime: z.number(),
    endTime: z.number(),
  })).optional(),
});

export type VideoSalesComposeBody = z.infer<typeof videoSalesComposeBodySchema>;
