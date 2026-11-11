import { replacePromptReferenceMentions } from '@shared/domain/prompts/prompt-engine/mentions';
import { inspirationImageUseOptions, inspirationVideoUseOptions, type InspirationItem, type InspirationUseOptions } from '../../model/inspirationItem';
import { useState, useEffect, useCallback, useMemo, useRef, useId, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { downloadMediaOrOpen } from '@client/shared/media/downloadMedia';
import {
  RotateCcw,
  Image as ImageIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Check,
  X,
} from 'lucide-react';
import { formatDisplayModel, formatPromptParagraphs } from '@shared/domain/media/drawing';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useScrollLock } from '@client/shared/hooks/useSafeTimeout';
import { videoPlaybackManager } from '@client/shared/media/videoPlaybackManager';

export const MEDIA_FALLBACK_IMG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg width="400" height="400" viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="400" rx="16" fill="#F8FAFC"/>
  <rect x="2" y="2" width="396" height="396" rx="14" stroke="#E2E8F0" stroke-width="2"/>
  <path d="M140 260L180 200L210 240L250 180L280 260H140Z" fill="#CBD5E1"/>
  <circle cx="175" cy="165" r="18" fill="#CBD5E1"/>
  <text x="200" y="300" text-anchor="middle" fill="#94A3B8" font-size="14" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif" font-weight="600">素材加载失败</text>
</svg>
`)}`;

const isRemoteMediaUrl = (url: string) =>
  url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//');

export const handleImgError = (e: SyntheticEvent<HTMLImageElement>, rawUrl?: string) => {
  const target = e.currentTarget;
  if (!rawUrl) {
    target.src = MEDIA_FALLBACK_IMG;
    return;
  }
  if (!target.dataset.hasRetried) {
    target.dataset.hasRetried = 'true';
    let fixed = rawUrl;
    if (/ci\.xiaohongshu\.com/i.test(fixed)) {
      fixed = fixed.replace(/https?:\/\/ci\.xiaohongshu\.com/i, 'https://sns-img-hw.xhscdn.com');
    }
    if (isRemoteMediaUrl(fixed)) {
      target.src = proxyMediaUrl(fixed);
    } else {
      const sep = fixed.includes('?') ? '&' : '?';
      target.src = `${fixed}${sep}retry=${Date.now()}`;
    }
  } else {
    target.src = MEDIA_FALLBACK_IMG;
  }
};

export function InspirationReferences({ images, labels, mode, onPreviewChange }: { images: string[]; labels?: string[]; mode?: string; onPreviewChange?: (dismiss: (() => void) | null) => void }) {
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewId = useId();
  const isOpen = !!position;
  useEffect(() => {
    onPreviewChange?.(isOpen ? () => {
      if (timer.current) clearTimeout(timer.current);
      trigger.current?.focus();
      setPosition(null);
    } : null);
    return () => onPreviewChange?.(null);
  }, [isOpen, onPreviewChange]);
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const closeSoon = () => { cancel(); timer.current = setTimeout(() => setPosition(null), 160); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [position]);
  if (!images.length) return null;
  const active = Math.min(index, images.length - 1);
  const url = images[active];
  const label = labels?.[active] || (mode === 'first_last_frame' && active < 2 ? (active === 0 ? '首帧' : '尾帧') : `图片 ${active + 1}`);
  const open = () => {
    cancel(); const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 232)), top: rect.top >= 240 ? rect.top - 232 : Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 232)) });
  };
  const media = (source: string, small = false) => isVideoMediaUrl(source)
    ? <video src={source} muted playsInline preload="metadata" controls={!small} className={small ? 'h-5 w-6 rounded object-cover' : 'h-full w-full object-contain'} />
    : <img src={source} alt={small ? '' : label} loading={small ? 'lazy' : 'eager'} className={small ? 'h-5 w-6 rounded object-cover' : 'h-full w-full object-contain'} />;
  return <>
    <button ref={trigger} type="button" aria-expanded={!!position} aria-controls={position ? previewId : undefined} aria-label={`查看参考素材，共 ${images.length} 个`} onMouseEnter={open} onMouseLeave={closeSoon} onFocus={open} onBlur={closeSoon} onClick={open} onKeyDown={event => { if (event.key === 'Escape') { setPosition(null); event.stopPropagation(); } }} className="flex shrink-0 items-center gap-1 rounded text-slate-600 hover:text-slate-900 focus-visible:outline-indigo-500 dark:hover:text-white dark:text-slate-300">
      {media(images[0], true)}<span>{mode === 'first_last_frame' ? '首尾帧参考' : '全能参考'}</span>
    </button>
    {position && createPortal(<div id={previewId} role="region" aria-label="参考素材预览" onMouseEnter={cancel} onMouseLeave={closeSoon} onFocus={cancel} onBlur={closeSoon} onKeyDown={event => { if (event.key === 'Escape') { trigger.current?.focus(); setPosition(null); event.stopPropagation(); } }} className="fixed z-[10000] h-56 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#18191c]" style={position}>
      <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-white/90 px-3 py-2 text-[11px] text-slate-600 backdrop-blur-sm dark:text-slate-300 dark:bg-[#18191c]/95">
        <span className="min-w-0 flex-1 truncate" title={label}>{label}</span><span className="shrink-0">{active + 1}/{images.length}</span>
        {images.length > 1 && <div className="flex gap-1"><button type="button" aria-label="上一张参考素材" onClick={() => setIndex((active + images.length - 1) % images.length)} className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-white/10"><ChevronLeft size={14} /></button><button type="button" aria-label="下一张参考素材" onClick={() => setIndex((active + 1) % images.length)} className="rounded p-0.5 hover:bg-slate-200 dark:hover:bg-white/10"><ChevronRight size={14} /></button></div>}
      </div>
      <div className="h-full w-full pt-9 p-2">{media(url)}</div>
    </div>, trigger.current?.closest('[role="dialog"]') || document.body)}
  </>;
}

function InspirationPromptPanel({ itemId, prompt, isVideo }: { itemId: string | number; prompt: string; isVideo: boolean }) {
  const [isPromptExpanded, setIsPromptExpanded] = useState(true);
  const promptParagraphs = useMemo(() => formatPromptParagraphs(prompt), [prompt]);
  const isLongPrompt = prompt.length > 120 || promptParagraphs.length > 2;

  useEffect(() => {
    setIsPromptExpanded(true);
  }, [itemId]);

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-normal text-slate-400 shrink-0">
            {isVideo ? '视频提示词' : '图片提示词'}
          </span>
        </div>
        {isLongPrompt && (
          <button
            type="button"
            onClick={() => setIsPromptExpanded(!isPromptExpanded)}
            className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition-colors cursor-pointer py-0.5 px-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
            title={isPromptExpanded ? '收起长文本' : '展开查看完整提示词'}
          >
            <span>{isPromptExpanded ? '收起' : '展开全文'}</span>
            {isPromptExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 stroke-[2.5]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
          </button>
        )}
      </div>

      <div className="relative">
        <div
          className={`text-[13px] sm:text-[13.5px] text-slate-800 dark:text-[#EDEDED] leading-relaxed font-normal select-text transition-all duration-300 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 pr-1 space-y-2.5 ${
            isPromptExpanded
              ? 'max-h-[50vh] pb-2'
              : 'max-h-40'
          }`}
        >
          {promptParagraphs.map((para, pIdx) => (
            <p key={pIdx} className="break-words leading-relaxed">
              {para}
            </p>
          ))}
        </div>

        {/* 收起状态且为长文本时，底部半透明渐变平滑遮罩（点击亦可展开全文） */}
        {!isPromptExpanded && isLongPrompt && (
          <div
            onClick={() => setIsPromptExpanded(true)}
            className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white via-white/70 to-transparent dark:from-[#1B1B1E] dark:via-[#1B1B1E]/70 dark:to-transparent pointer-events-auto cursor-pointer"
            title="点击展开全文"
          />
        )}
      </div>
    </div>
  );
}

interface Props {
  item: InspirationItem | null;
  allItems: InspirationItem[];
  isOpen: boolean;
  onClose: () => void;
  onUsePrompt: (prompt: string, opts: InspirationUseOptions) => string | undefined;
  onNavigate?: (newItem: InspirationItem) => void;
}

export default function InspirationModal({ item, allItems, isOpen, onClose, onUsePrompt, onNavigate }: Props) {
  const dismissReferenceRef = useRef<(() => void) | null>(null);
  const registerReferencePreview = useCallback((dismiss: (() => void) | null) => { dismissReferenceRef.current = dismiss; }, []);
  const dialogRef = useModalDialog(isOpen, () => {
    if (dismissReferenceRef.current) dismissReferenceRef.current();
    else onClose();
  });
  useScrollLock(isOpen, '[data-hub-scroll]');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState<string>();
  const [applyError, setApplyError] = useState<string>();
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const downloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) return videoPlaybackManager.suspend();
  }, [isOpen]);

  useEffect(() => {
    setVideoLoadFailed(false);
  }, [item?.id]);

  useEffect(() => {
    return () => {
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
    };
  }, []);

  const currentIndex = item ? allItems.findIndex(i => i.id === item.id) : -1;
  const total = allItems.length;

  const handlePrev = useCallback(() => {
    if (total > 1 && onNavigate && currentIndex >= 0) {
      const prevIdx = (currentIndex - 1 + total) % total;
      onNavigate(allItems[prevIdx]);
    }
  }, [total, onNavigate, currentIndex, allItems]);

  const handleNext = useCallback(() => {
    if (total > 1 && onNavigate && currentIndex >= 0) {
      const nextIdx = (currentIndex + 1) % total;
      onNavigate(allItems[nextIdx]);
    }
  }, [total, onNavigate, currentIndex, allItems]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || !item || e.defaultPrevented || e.isComposing) return;
      const target = e.target;
      if (target instanceof Element && target.closest('input, textarea, select, video, [contenteditable="true"], [aria-label="参考素材预览"], [aria-expanded="true"][aria-controls]')) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, item, onClose, handlePrev, handleNext]);

  const isVideo = item ? (item.mediaType === 'video' || !!item.video || isVideoMediaUrl(item.image)) : false;

  const handleDownload = async () => {
    if (!item) return;
    const url = item.video || item.image;
    if (!url || isDownloading) return;
    setIsDownloading(true);
    setDownloadError(undefined);
    try {
      const ext = isVideo ? 'mp4' : 'jpg';
      const filename = `${item.title || 'inspiration'}_${Date.now()}.${ext}`;
      await downloadMediaOrOpen(url, filename);
      setDownloadSuccess(true);
      if (downloadTimerRef.current) clearTimeout(downloadTimerRef.current);
      downloadTimerRef.current = setTimeout(() => {
        setDownloadSuccess(false);
      }, 2000);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : '下载失败，请重试');
    } finally {
      setIsDownloading(false);
    }
  };

  const authorName = item?.author?.name && item.author.name !== 'alone' ? item.author.name : '贝壳云图';

  const qualityLabel = useMemo(() => {
    if (isVideo) {
      return item?.quality || '';
    }
    if (item?.quality) {
      const q = String(item.quality).toUpperCase();
      if (q.includes('4K')) return '4K';
      if (q.includes('2K')) return '2K';
      if (q.includes('1K')) return '1K';
      return item.quality;
    }
    const model = String(item?.model || '').toLowerCase();
    if (model.includes('4k')) return '4K';
    if (model.includes('2k')) return '2K';
    return '';
  }, [isVideo, item?.quality, item?.model]);

  const modelLabel = useMemo(() => {
    if (!item) return '';
    return item.model ? formatDisplayModel(item.model) : '';
  }, [item]);

  const durationLabel = useMemo(() => {
    if (!isVideo || !item) return null;
    const dur = item.actualVideoDuration ?? item.videoDuration;
    if (typeof dur === 'number' && dur > 0) return `${Math.round(dur * 10) / 10}s`;
    return null;
  }, [isVideo, item]);

  const aspectRatio = item?.aspectRatio || null;
  const metadata = [modelLabel, isVideo ? durationLabel : qualityLabel, aspectRatio].filter(Boolean);
  const [mediaWidth,mediaHeight]=(aspectRatio || '').split(':').map(Number);
  const wideVideo=isVideo && mediaWidth>mediaHeight;

  if (!isOpen || !item || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      tabIndex={-1}
      className="fixed inset-0 z-[9999] overflow-y-auto overscroll-contain bg-black/60 flex items-start md:items-center justify-center p-4 sm:p-6 lg:p-10 select-none font-sans animate-fade-in cursor-zoom-out"
      onClick={onClose}
    >
      <button type="button" aria-label="关闭作品预览" onClick={event => { event.stopPropagation(); onClose(); }} className="fixed right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
        <X className="h-5 w-5" />
      </button>
      {/* 🌟 居中大方的主容器 (左侧媒体展示 + 左右大箭头 + 右侧信息面板) */}
      <div className={`w-full ${wideVideo ? 'max-w-[1680px] gap-4 lg:gap-5' : 'max-w-5xl xl:max-w-6xl 2xl:max-w-7xl gap-4 lg:gap-8'} md:max-h-[92vh] flex flex-col md:flex-row items-center justify-center relative pointer-events-none`}>
        {/* 🌟 1. 左侧：全尺寸高清大图/高清视频呈现 + 原生对称左右翻页控制器 (外置并列，远离图片边缘) */}
        <div className="w-full md:flex-1 h-full max-h-[45vh] md:max-h-[88vh] flex items-center justify-center gap-3 sm:gap-5 lg:gap-7 relative min-w-0 group/canvas pointer-events-none">
          {/* 左翻页按钮 (← 上一个，循环轮播，外置脱离图片) */}
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className={`${wideVideo ? 'absolute left-3 top-1/2 -translate-y-1/2' : ''} shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white shadow-xl border border-white/20 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer z-20 backdrop-blur-md group/btn pointer-events-auto`}
              title="上一个 (←)"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.2] group-hover/btn:-translate-x-0.5 transition-transform" />
            </button>
          )}

          {/* 中间媒体展示区 */}
          <div className="relative flex items-center justify-center flex-1 max-w-full h-full min-w-0 overflow-hidden pointer-events-none">
            {isVideo ? (
              <div className="relative max-h-[45vh] md:max-h-[86vh] max-w-full">
                <video
                  key={item.video || item.image}
                  src={videoLoadFailed ? undefined : (item.video || item.image)}
                  poster={item.poster}
                  controls={!videoLoadFailed}
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                  onError={() => setVideoLoadFailed(true)}
                  onClick={(e) => e.stopPropagation()}
                  className={`max-h-[45vh] md:max-h-[86vh] ${wideVideo ? 'w-full' : 'w-auto'} max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.22)] border border-white/60 select-none transition-all duration-300 bg-black cursor-default pointer-events-auto`}
                />
                {videoLoadFailed && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-black/70 pointer-events-auto">
                    <p className="text-sm text-white/90">视频文件缺失</p>
                  </div>
                )}
              </div>
            ) : (
              <img
                key={item.image}
                src={item.image}
                alt={item.title}
                referrerPolicy="no-referrer"
                onError={(e) => handleImgError(e, item.image)}
                onClick={(e) => e.stopPropagation()}
                className="max-h-[45vh] md:max-h-[86vh] w-auto max-w-full object-contain rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.18)] border border-white/60 select-none transition-all duration-300 bg-slate-100 cursor-default pointer-events-auto dark:bg-white/10"
              />
            )}
          </div>

          {/* 右翻页按钮 (→ 下一个，循环轮播，外置脱离图片) */}
          {total > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className={`${wideVideo ? 'absolute right-3 top-1/2 -translate-y-1/2' : ''} shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/60 hover:bg-black/90 text-white shadow-xl border border-white/20 flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer z-20 backdrop-blur-md group/btn pointer-events-auto`}
              title="下一个 (→)"
            >
              <ChevronRight className="w-6 h-6 stroke-[2.2] group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* 🌟 2. 右侧：精致大方的信息与操作面板 */}
        <div
          className={`w-full ${wideVideo ? 'md:w-[300px] lg:w-[320px] xl:w-[340px]' : 'md:w-[350px] lg:w-[380px] xl:w-[400px]'} md:max-h-[86vh] bg-white dark:bg-[#1B1B1E] text-slate-900 dark:text-[#EDEDED] rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 dark:border-white/10 flex flex-col justify-between flex-shrink-0 overflow-y-auto relative pointer-events-auto`}
          onClick={(e) => e.stopPropagation()}
        >

          <div className="space-y-4">
            {/* 作者信息与素材下载 */}
            <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-white dark:bg-[#26262B] border border-slate-200/80 dark:border-white/10 flex items-center justify-center shadow-xs shrink-0 select-none p-0.5">
                  <img
                    src="/app_logo.png"
                    alt={authorName}
                    draggable={false}
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white truncate max-w-[150px] sm:max-w-[180px]">
                  {authorName}
                </span>
              </div>

              {/* 右侧：下载按钮 (图 1 方形浅灰圆角外框) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="w-9 h-9 rounded-xl bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-[#C7C7CC] hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  title={isVideo ? '下载高清视频' : '下载高清原图'}
                >
                  {downloadSuccess ? (
                    <Check className="w-4.5 h-4.5 text-emerald-600 stroke-[2.2]" />
                  ) : (
                    <Download className="w-4.5 h-4.5 stroke-[1.8]" />
                  )}
                </button>
              </div>
            </div>

            {downloadError && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{downloadError}</p>}

            {/* 日期与生成标记 */}
            <div className="text-xs text-slate-400 dark:text-[#8E8E93] font-sans">
              <span>{item.date || '精选作品'}</span>
            </div>

            <InspirationPromptPanel itemId={item.id} prompt={item.prompt} isVideo={isVideo} />

            <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center flex-wrap gap-x-2.5 gap-y-1.5 text-[12px] sm:text-[12.5px] text-slate-500 dark:text-[#8E8E93] select-none">
              {!!item.referenceImages?.length &&
                <InspirationReferences key={item.id} images={item.referenceImages} labels={item.referenceLabels} mode={item.videoRefMode} onPreviewChange={registerReferencePreview}/>
              }
              {metadata.length > 0 && <span className="break-words font-normal">
                {!!item.referenceImages?.length && <span className="mr-2.5 text-slate-300 dark:text-white/20">|</span>}
                {metadata.join(' | ')}
              </span>}
            </div>
          </div>

          {applyError && <p role="status" className="mt-4 text-sm text-amber-700 dark:text-amber-300">{applyError}</p>}
          {/* 🌟 底部双按钮 (做同款 / 用作参考图) */}
          <div className="pt-5 mt-4 border-t border-slate-100 dark:border-white/[0.06] flex items-center gap-3">
            {/* 做同款 */}
            <button
              type="button"
              onClick={() => setApplyError(onUsePrompt(
                item.referencePrompt || item.prompt,
                isVideo ? inspirationVideoUseOptions(item) : inspirationImageUseOptions(item),
              ))}
              className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-[#EDEDED] font-medium text-[13.5px] sm:text-[14px] flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-slate-700 dark:text-[#E5E5EA] stroke-[2.2]" />
              <span>做同款</span>
            </button>

            {/* 用作参考图 */}
            <button
              type="button"
              onClick={() => setApplyError(onUsePrompt(
                replacePromptReferenceMentions(item.referencePrompt || item.prompt),
                isVideo
                  ? { ...inspirationVideoUseOptions(item), referenceImages: [item.video || item.image], videoRefMode: 'omni', referenceAudioUrls: [], referenceVideoUrls: [item.video || item.image] }
                  : { ...inspirationImageUseOptions(item), referenceImages: [item.image] },
              ))}
              className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-transparent hover:bg-slate-100 dark:hover:bg-white/10 text-slate-800 dark:text-[#EDEDED] font-medium text-[13.5px] sm:text-[14px] flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4 text-slate-700 dark:text-[#E5E5EA] stroke-[2.2]" />
              <span>{isVideo ? '用作参考素材' : '用作参考图'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
