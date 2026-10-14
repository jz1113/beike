import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Zap } from 'lucide-react';
import { useAppStore } from '@client/store';
import type { MediaAttachment } from '@client/store/appStoreTypes';
import { prepareAssistantImagePrompt } from '../model/assistantPromptReferences';
import { isImagePrompt } from '../model/batchImagePrompts';

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
    <div className="rounded-xl overflow-hidden bg-zinc-100/80 border border-zinc-200/80 my-2 text-xs font-mono">
      <div className="px-3 py-1.5 bg-zinc-100 border-b border-zinc-200/70 flex items-center justify-between text-zinc-500 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{displayLang}</span>
          {ar && (
            <span className="px-1.5 py-0.2 rounded bg-zinc-200/80 text-zinc-600 font-mono text-[9.5px] font-bold">
              --ar {ar}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isPromptCode && !incomplete && (
            <button
              type="button"
              onClick={handleSendToGenerate}
              className="flex items-center gap-1 text-[11px] font-bold text-zinc-700 hover:text-zinc-900 bg-white hover:bg-zinc-200/60 px-2 py-0.5 rounded-lg transition-colors cursor-pointer border border-zinc-300/70"
              title="将提示词和对应参考图一起载入生图区，自动对应图片编号"
            >
              <Zap className="w-3 h-3 text-zinc-500" />
              <span>{dispatched ? `已载入${loadedImageCount ? ` ${loadedImageCount} 张参考图` : '生图区'} ✓` : '一键载入生图'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-zinc-800 transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-zinc-200/70"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
        </div>
      </div>
      {incomplete && <p className="px-3 py-1 text-[11px] text-zinc-500">代码块尚未结束，内容可能不完整。</p>}
      {dispatchError && <p role="alert" className="px-3 py-2 text-xs text-rose-200 bg-rose-950/50">{dispatchError}</p>}
      {copyError && <p role="alert" className="px-3 py-2 text-xs text-rose-700">{copyError}</p>}
      <pre className="p-3 overflow-x-auto text-zinc-800 leading-6 selection:bg-zinc-300/60 text-[11.5px] whitespace-pre-wrap break-words">
        <code>{code}</code>
      </pre>
    </div>
  );
}
