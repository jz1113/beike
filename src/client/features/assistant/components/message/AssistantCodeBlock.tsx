import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Zap } from 'lucide-react';
import { useAppStore } from '@client/store';
import { resolveGptImageSizeForModel } from '@shared/domain/models/model-adapters/image/gptImageSafeSizes';
import type { GenerationTask, MediaAttachment } from '@client/store/appStoreTypes';
import { prepareAssistantImagePrompt } from '../../model/assistantConstants';

export function isImagePrompt(code: string, lang = '') {
  return /^(text|plaintext|prompt|markdown|md)?$/i.test(lang) && /--ar\s+\d+:\d+|特写|抓拍|原相机|实拍|光影|半身|全景|景深|焦点|质感|[@＠]\s*(?:图片|图)/i.test(code);
}

export interface ImageBatchEntry {
  id: string;
  title: string;
  code: string;
}

export function extractImageBatch(content: string): ImageBatchEntry[] {
  const candidates: Array<ImageBatchEntry & { page: string }> = [];
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
        if (!excluded && isImagePrompt(text, lang)) candidates.push({ id: String(candidates.length), title, page, code: text });
        lang = undefined;
      } else {
        lang = line.trim().slice(3).trim();
        code = [];
      }
    } else if (lang !== undefined) code.push(line);
    else {
      const label = line.replace(/^[#\s]+|\*\*/g, '').trim();
      const match = label.match(pagePattern);
      if (/以前|旧版|第一版|第\s*1\s*版|不要再写|减少或删除|负面(?:提示|关键词)|反例/.test(label)) {
        excluded = true;
        title = '';
        page = '';
      } else if (match && /^(?:第|\d+[.、]\s*第)/.test(label)) {
        title = label;
        page = match[1];
        excluded = false;
      } else if (/^(?:生图提示词|图片提示词|Prompt)[：:]?$/i.test(label) && page) {
        excluded = false;
      } else if (/^#{1,6}\s/.test(line) || /关键词|建议改成|小字[：:]|文案[：:]/.test(label)) {
        title = '';
        page = '';
        excluded = /关键词|建议改成|小字|文案/.test(label);
      }
    }
  }
  // Numbered deliverables take precedence over generic examples in the same reply.
  const numbered = candidates.filter((entry) => entry.page);
  const entries = numbered.length ? [...new Map(numbered.map((entry) => [entry.page, entry])).values()] : candidates;
  return entries.map((entry, index) => ({ id: String(index), title: entry.title || `第 ${index + 1} 张`, code: entry.code }));
}

export function buildAssistantBatch(
  entries: ImageBatchEntry[],
  media: MediaAttachment[],
  settings: { model: string; size: string; quality: string },
): GenerationTask[] {
  if (!settings.model) throw new Error('请先在生图区选择生图模型');
  const now = Date.now();
  const batchId = `assistant-batch-${crypto.randomUUID()}`;
  // Validate every reference first: one missing image must not create a partial batch.
  return entries.map((entry, index) => {
    let prepared: ReturnType<typeof prepareAssistantImagePrompt>;
    try {
      prepared = prepareAssistantImagePrompt(entry.code, media);
    } catch (error) {
      throw new Error(`${entry.title}：${error instanceof Error ? error.message : '参考图缺失'}`);
    }
    const ratio = entry.code.match(/--ar\s+(\d+:\d+)/)?.[1] || settings.size;
    const size = settings.model.toLowerCase().includes('gpt-image')
      ? resolveGptImageSizeForModel(ratio, settings.model, settings.quality as 'high' | 'medium' | 'low')
      : ratio;
    return {
      id: `${batchId}-${index}`,
      batchId,
      shotNo: index + 1,
      title: entry.title,
      prompt: prepared.prompt.replace(/--ar\s+\d+:\d+/g, '').trim(),
      mediaType: 'image',
      model: settings.model,
      size,
      quality: settings.quality,
      referenceImageUrl: prepared.urls[0],
      images: prepared.urls,
      referenceImages: prepared.urls,
      useReferenceImage: prepared.urls.length > 0,
      status: 'IN_PROGRESS',
      progress: '0%',
      createdAt: now,
    };
  });
}

export default function AssistantCodeBlock({ 
  code, 
  lang, 
  referenceMedia,
  incomplete = false,
}: { 
  code: string; 
  lang?: string; 
  referenceMedia: MediaAttachment[];
  incomplete?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [dispatched, setDispatched] = useState(false);
  const [dispatchError, setDispatchError] = useState('');
  const [loadedImageCount, setLoadedImageCount] = useState(0);
  const [copyError, setCopyError] = useState('');
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dispatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    if (dispatchTimerRef.current) clearTimeout(dispatchTimerRef.current);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyError('');
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('复制失败，请选中正文手动复制。');
    }
  };

  const handleSendToGenerate = () => {
    try {
      const { prompt, urls } = prepareAssistantImagePrompt(code, referenceMedia);
      const store = useAppStore.getState();
      store.setQuickRefImages(urls);
      store.setQuickPrompt(prompt);
      store.setQuickGenMode('image');
      store.setCurrentView('home');
      store.setIsAssistantOpen(false);
      setDispatchError('');
      setLoadedImageCount(urls.length);
      setDispatched(true);
      if (dispatchTimerRef.current) clearTimeout(dispatchTimerRef.current);
      dispatchTimerRef.current = setTimeout(() => setDispatched(false), 2500);
    } catch (error) {
      setDispatched(false);
      setDispatchError(error instanceof Error ? error.message : '载入失败，请重试。');
    }
  };

  const ratioMatch = code.match(/--ar\s+([0-9:]+)/);
  const ar = ratioMatch ? ratioMatch[1] : undefined;
  const isPromptCode = isImagePrompt(code, lang);
  const displayLang = lang || (isPromptCode ? 'AI 提示词' : 'CODE');

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100/80 font-mono text-xs dark:border-white/10 dark:bg-[#1c1c1f] dark:text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/70 bg-zinc-100 px-3 py-1.5 text-zinc-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-400">{displayLang}</span>
          {ar && (
            <span className="rounded bg-zinc-200/80 px-1.5 py-0.2 font-mono text-[9.5px] font-bold text-zinc-600 dark:bg-white/10 dark:text-slate-200">
              --ar {ar}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isPromptCode && !incomplete && (
            <button
              type="button"
              onClick={handleSendToGenerate}
              className="flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-300/70 bg-white px-2 py-0.5 text-[11px] font-bold text-zinc-700 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15 dark:hover:text-white"
              title="将提示词和对应参考图一起载入生图区，自动对应图片编号"
            >
              <Zap className="h-3 w-3 text-zinc-500 dark:text-slate-300" />
              <span>{dispatched ? `已载入${loadedImageCount ? ` ${loadedImageCount} 张参考图` : '生图区'} ✓` : '一键载入生图'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>
      {incomplete && <p className="px-3 py-1 text-[11px] text-zinc-500 dark:text-slate-400">代码块尚未结束，内容可能不完整。</p>}
      {dispatchError && <p role="alert" className="bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">{dispatchError}</p>}
      {copyError && <p role="alert" className="px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{copyError}</p>}
      <pre className="overflow-x-auto p-3 text-[11.5px] leading-6 break-words whitespace-pre-wrap text-zinc-800 selection:bg-zinc-300/60 dark:text-slate-100 dark:selection:bg-white/20">
        <code>{code}</code>
      </pre>
    </div>
  );
}
