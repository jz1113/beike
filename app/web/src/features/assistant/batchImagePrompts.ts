import { resolveGptImageSizeForModel } from '@beike/domain/modelAdapters/image/gptImageSafeSizes';
import type { GenerationTask, MediaAttachment } from '@/types/app-store';
import { prepareAssistantImagePrompt } from './assistantPromptReferences';

export function isImagePrompt(code: string, lang = '') {
  return /^(text|plaintext|prompt|markdown|md)?$/i.test(lang) && /--ar\s+\d+:\d+|特写|抓拍|原相机|实拍|光影|半身|全景|景深|焦点|质感|[@＠]\s*(?:图片|图)/i.test(code);
}
export interface ImageBatchEntry { id: string; title: string; code: string }
export function extractImageBatch(content: string): ImageBatchEntry[] {
  const candidates: Array<ImageBatchEntry & {page: string}> = [];
  let title = '';
  let page = '';
  let excluded = false;
  let lang: string | undefined;
  let code: string[] = [];
  const pagePattern = /第\s*([0-9一二三四五六七八九十]+)\s*[张页]/;
  for (const line of content.split('\n')) {
    if (line.trim().startsWith('```')) {
      if (lang !== undefined) {
        const text = code.join('\n').trim();
        if (!excluded && isImagePrompt(text, lang)) candidates.push({id: String(candidates.length), title, page, code: text});
        lang = undefined;
      } else {lang = line.trim().slice(3).trim(); code = [];}
    } else if (lang !== undefined) code.push(line);
    else {
      const label = line.replace(/^[#\s]+|\*\*/g, '').trim();
      const match = label.match(pagePattern);
      if (/以前|旧版|第一版|第\s*1\s*版|不要再写|减少或删除|负面(?:提示|关键词)|反例/.test(label)) {
        excluded = true; title = ''; page = '';
      } else if (match && /^(?:第|\d+[.、]\s*第)/.test(label)) {
        title = label; page = match[1]; excluded = false;
      } else if (/^(?:生图提示词|图片提示词|Prompt)[：:]?$/i.test(label) && page) {
        excluded = false;
      } else if (/^#{1,6}\s/.test(line) || /关键词|建议改成|小字[：:]|文案[：:]/.test(label)) {
        title = ''; page = '';
        excluded = /关键词|建议改成|小字|文案/.test(label);
      }
    }
  }
  // Numbered deliverables take precedence over generic examples in the same reply.
  const numbered = candidates.filter(entry => entry.page);
  const entries = numbered.length ? [...new Map(numbered.map(entry => [entry.page, entry])).values()] : candidates;
  return entries.map((entry, index) => ({id: String(index), title: entry.title || `第 ${index + 1} 张`, code: entry.code}));
}

export function buildAssistantBatch(entries: ImageBatchEntry[], media: MediaAttachment[], settings: { model: string; size: string; quality: string }): GenerationTask[] {
  if (!settings.model) throw new Error('请先在生图区选择生图模型');
  const now = Date.now();
  const batchId = `assistant-batch-${crypto.randomUUID()}`;
  // Validate every reference first: one missing image must not create a partial batch.
  return entries.map((entry, index) => {
    let prepared: ReturnType<typeof prepareAssistantImagePrompt>;
    try { prepared = prepareAssistantImagePrompt(entry.code, media); }
    catch (error) { throw new Error(`${entry.title}：${error instanceof Error ? error.message : '参考图缺失'}`); }
    const ratio = entry.code.match(/--ar\s+(\d+:\d+)/)?.[1] || settings.size;
    const size = settings.model.toLowerCase().includes('gpt-image')
      ? resolveGptImageSizeForModel(ratio, settings.model, settings.quality as 'high' | 'medium' | 'low') : ratio;
    return {
      id: `${batchId}-${index}`, batchId, shotNo: index + 1, title: entry.title,
      prompt: prepared.prompt.replace(/--ar\s+\d+:\d+/g, '').trim(),
      mediaType: 'image', model: settings.model, size, quality: settings.quality,
      referenceImageUrl: prepared.urls[0], images: prepared.urls,
      referenceImages: prepared.urls, useReferenceImage: prepared.urls.length > 0,
      status: 'IN_PROGRESS', progress: '0%', createdAt: now,
    };
  });
}
