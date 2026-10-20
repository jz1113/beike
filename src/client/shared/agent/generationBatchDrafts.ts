import { z } from 'zod';
import type { GenerationPromptSource } from './generationBatchSources';
import type { BatchGenerationSettings, BatchPromptDraft } from './buildGenerationPromptBatch';

const KEY = 'beike_agent_generation_drafts_v1';
const schema = z.object({
  entries: z.array(z.object({
    id: z.string().min(1).max(128), title: z.string().max(160), prompt: z.string().min(1).max(100_000),
    mediaType: z.enum(['image', 'video']), aspect: z.string().max(32).optional(), duration: z.number().finite().optional(),
    issue: z.string().optional(), referenceIndexes: z.array(z.number().int().min(0).max(49)).max(50).optional(),
  })).max(30),
  settings: z.object({
    imageModel: z.string().max(200), imageAspect: z.string().max(32), imageQuality: z.enum(['high', 'medium', 'low']),
    videoModel: z.string().max(200), videoAspect: z.string().max(32), videoResolution: z.enum(['480P', '720P', '1080P', '4K']),
    videoDuration: z.number().finite(), videoRefMode: z.string().max(40), videoGenerateAudio: z.boolean().optional(),
  }),
});

function readDrafts(): Record<string, unknown> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('提示词草稿记录无效，请重新保存清单');
  return value as Record<string, unknown>;
}

export function readGenerationBatchDraft(source: GenerationPromptSource) {
  const record = readDrafts()[source.sourceId];
  if (!record) return undefined;
  const result = schema.safeParse(record);
  if (!result.success || result.data.entries.some(entry => !source.entries.some(original => original.id === entry.id))) throw new Error('提示词草稿已失效，请重新保存原回复清单');
  return result.data;
}

export function saveGenerationBatchDraft(sourceId: string, entries: BatchPromptDraft[], settings: BatchGenerationSettings) {
  const data = schema.parse({ entries, settings });
  const drafts = readDrafts(); drafts[sourceId] = data;
  try { localStorage.setItem(KEY, JSON.stringify(drafts)); }
  catch { throw new Error('草稿保存失败，请检查浏览器存储空间；不会启动生成'); }
}
