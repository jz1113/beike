import { extractTaskReferenceImages } from './taskReferenceImages';
import React, { useMemo, useState } from 'react';
import {
  Download,
  Film,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Image as ImageIcon,
  Check,
} from 'lucide-react';
import {
  formatDisplayModel,
  formatDepthQualityLabel,
  formatImageQualityLabel,
  getAspectRatioFromSize,
  isDepthMediaType,
} from '@beike/shared/drawing';
import { isVideoMediaUrl } from '@/lib/mediaHelper';
import { proxyMediaUrl } from '@/lib/apiClient';
import type { GenerationTask } from '@/store/useAppStore';

function ReferenceThumbnail({ url, video }: { url: string; video: boolean }) {
  const [useOriginal, setUseOriginal] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const source = useOriginal ? url : proxyMediaUrl(url, video ? { asVideo: true } : { thumb: true, width: 64 });
  const onError = () => {
    setReady(false);
    if (!useOriginal && source !== url) setUseOriginal(true);
    else setFailed(true);
  };
  return (
    <span className="relative w-5 h-5 shrink-0 rounded-xs overflow-hidden inline-flex items-center justify-center bg-slate-100 text-slate-400">
      {(!ready || failed) && (video ? <Film className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />)}
      {!failed && (video ? (
        <video key={source} src={source} muted playsInline preload="auto" aria-label="参考视频缩略图"
          className={`absolute inset-0 w-full h-full object-cover ${ready ? '' : 'opacity-0'}`}
          onLoadedMetadata={(event) => {
            const element = event.currentTarget;
            if (Number.isFinite(element.duration) && element.duration > 0.1) element.currentTime = Math.min(0.1, element.duration / 2);
          }}
          onLoadedData={() => setReady(true)} onSeeked={() => setReady(true)} onError={onError} />
      ) : (
        <img key={source} src={source} alt="" loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover ${ready ? '' : 'opacity-0'}`}
          onLoad={() => setReady(true)} onError={onError} />
      ))}
    </span>
  );
}

export interface LightboxInfoPanelProps {
  previewTask: GenerationTask;
  isVideo: boolean;
  actualVideoDuration?: number;
  dateStr?: string;
  isDownloading?: boolean;
  downloadSuccess?: boolean;
  handleDownload?: () => void;
  promptText?: string;
  promptParagraphs?: string[];
  isLongPrompt?: boolean;
  isPromptExpanded?: boolean;
  setIsPromptExpanded?: (exp: boolean) => void;
  onUsePromptOnly?: () => void;
  onUseAsReference?: () => void;
  authorName?: string;
  fallbackReferenceImages?: string[];
}

export const LightboxInfoPanel = React.memo(function LightboxInfoPanel({
  previewTask,
  isVideo,
  actualVideoDuration,
  dateStr,
  isDownloading = false,
  downloadSuccess = false,
  handleDownload = () => {},
  promptText = '',
  promptParagraphs = [],
  isLongPrompt = false,
  isPromptExpanded = false,
  setIsPromptExpanded = () => {},
  onUsePromptOnly,
  onUseAsReference,
  authorName = '贝壳云图',
  fallbackReferenceImages,
}: LightboxInfoPanelProps) {


  const modelLabel = previewTask?.model
    ? formatDisplayModel(previewTask.model, isVideo)
    : isVideo
      ? '即梦视频 2.0'
      : 'GPT Image 2';

  const aspectRatio =
    (previewTask as any)?.aspectRatio ||
    getAspectRatioFromSize(previewTask?.size) ||
    '3:4';

  const rawQuality =
    previewTask?.quality ||
    (previewTask as any)?.params?.quality ||
    (previewTask as any)?.options?.quality;

  const qualityLabel = useMemo(() => {
    if (isVideo) {
      return previewTask?.videoResolution || rawQuality || '720P';
    }
    if (isDepthMediaType(previewTask?.mediaType)) {
      return formatDepthQualityLabel(rawQuality);
    }

    if (rawQuality) {
      const q = String(rawQuality).toLowerCase();
      if (q === 'low' || q === '1k') return '1K';
      if (q === 'high' || q === '4k') return '4K';
      if (q === 'medium' || q === '2k') return '2K';
    }

    const model = String(previewTask?.model || '').toLowerCase();
    if (model.includes('4k')) return '4K';
    if (model.includes('2k')) return '2K';
    if (model.includes('1k')) return '1K';

    const sizeStr = String(previewTask?.size || '');
    if (/^\d+\s*x\s*\d+$/i.test(sizeStr.trim())) {
      const parts = sizeStr.split(/x/i).map((v) => parseInt(v.trim(), 10));
      const maxEdge = Math.max(parts[0] || 0, parts[1] || 0);
      if (maxEdge >= 3000) return '4K';
      if (maxEdge >= 1500) return '2K';
      if (maxEdge > 0) return '1K';
    }

    return formatImageQualityLabel(rawQuality) || '2K';
  }, [
    isVideo,
    previewTask?.mediaType,
    previewTask?.videoResolution,
    previewTask?.model,
    previewTask?.size,
    rawQuality,
  ]);

  const displayDateStr = dateStr || '2026-08-19';

  // 提取该任务生成时使用的参考素材（支持多图垫图、首尾帧、商品原图、同批次回溯或溯源图）
  const referenceImagesList = useMemo(() => {
    if (!previewTask) return [];
    const list: string[] = [];
    const pushIfValid = (val: any) => {
      if (typeof val === 'string' && val.trim().length > 0) {
        list.push(val.trim());
      } else if (Array.isArray(val)) {
        val.forEach(pushIfValid);
      }
    };

    const extractFromTask = (task: unknown) => {
      extractTaskReferenceImages(task).forEach(pushIfValid);
    };

    // 1. 优先提取当前 previewTask 单体自身所有字段
    extractFromTask(previewTask);

    // 2. 补充同批次/同队列素材池（确保翻页到任何子任务时，参考素材全集不漏）
    if (fallbackReferenceImages && fallbackReferenceImages.length > 0) {
      fallbackReferenceImages.forEach(pushIfValid);
    }

    // 过滤去重，并且排除与当前结果视频/结果图完全相同的 URL
    return Array.from(new Set(list)).filter((url) => Boolean(url) && url !== previewTask.resultUrl);
  }, [previewTask, fallbackReferenceImages]);

  const durationLabel = useMemo(() => {
    if (!isVideo) return null;
    const candidates = [actualVideoDuration, previewTask?.videoDuration,
      (previewTask as any)?.params?.duration, (previewTask as any)?.options?.duration];
    for (const value of candidates) {
      const seconds = typeof value === 'string' ? Number(value.trim().replace(/s$/i, '')) : value;
      if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
        return `${Math.round(seconds * 10) / 10}s`;
      }
    }
    return null;
  }, [isVideo, previewTask, actualVideoDuration]);

  return (
    <div className="w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 flex flex-col justify-between flex-shrink-0 select-none relative animate-fade-in">
      <div className="space-y-4">
        {/* 🌟 1. 顶部 Header: 左侧贝壳云图官方作者信息，右侧方形浅灰圆角下载按钮 (1:1 对齐图 1) */}
        <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-transparent flex items-center justify-center shrink-0 select-none p-0.5">
              <img
                src="/app_logo.png"
                alt={authorName}
                draggable={false}
                className="w-full h-full object-contain"
              />
            </div>
            <span className="text-[14px] font-semibold text-slate-900 truncate max-w-[150px] sm:max-w-[180px]">
              {authorName}
            </span>
          </div>

          {/* 右侧：透明背景下载按钮 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="w-9 h-9 rounded-xl bg-transparent hover:bg-transparent hover:opacity-70 text-slate-700 flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-50"
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

        {/* 🌟 2. 日期与 AI 标记 */}
        <div className="text-xs text-slate-400 font-sans">
          <span>{`${displayDateStr} | 内容由 AI 生成`}</span>
        </div>

        {/* 🌟 3. 提示词标题与展开/收起 + 正文排版 (1:1 对齐图 1) */}
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
                className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors cursor-pointer py-0.5 px-2 rounded-lg hover:bg-indigo-50"
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
              className={`text-[13px] sm:text-[13.5px] text-slate-800 leading-relaxed font-normal select-text transition-all duration-300 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 pr-1 space-y-2.5 ${
                isPromptExpanded ? 'max-h-[36vh] pb-2' : 'max-h-36'
              }`}
            >
              {(promptParagraphs.length > 0 ? promptParagraphs : (promptText || previewTask?.prompt || '').split('\n').filter(Boolean)).map((para, pIdx) => (
                <p key={pIdx} className="break-words leading-relaxed">
                  {para}
                </p>
              ))}
            </div>

            {/* 收起状态且为长文本时，底部半透明渐变平滑遮罩（点击亦可展开全文） */}
            {!isPromptExpanded && isLongPrompt && (
              <div
                onClick={() => setIsPromptExpanded(true)}
                className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white via-white/70 to-transparent pointer-events-auto cursor-pointer"
                title="点击展开全文"
              />
            )}
          </div>
        </div>

        {/* 🌟 4. 参数规格内联展示条 (1:1 严格对齐图 1：无边框无胶囊，细竖线分割，纯净扁平) */}
        <div className="pt-3 border-t border-slate-100 flex items-center flex-wrap gap-x-2.5 gap-y-1.5 text-[12px] sm:text-[12.5px] text-slate-500 select-none">
          {/* 素材统一在参数行展示，保留所有参考图的查看入口。 */}
          {referenceImagesList.map((refUrl, index) => {
            const referenceIsVideo = isVideoMediaUrl(refUrl);
            const label = referenceIsVideo ? '参考视频' : isVideo && previewTask?.videoRefMode === 'first_last_frame' && index < 2
              ? (index === 0 ? '首帧' : '尾帧')
              : referenceImagesList.length === 1 ? '参考图' : `@图片${index + 1}`;
            return (
              <React.Fragment key={refUrl}>
                <button
                  type="button"
                  onClick={() => window.open(refUrl, '_blank', 'noopener,noreferrer')}
                  className="inline-flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
                  title={referenceIsVideo ? '点击在新窗口查看参考视频' : '点击在新窗口查看参考素材原图'}
                >
                  <ReferenceThumbnail key={refUrl} url={refUrl} video={referenceIsVideo} />
                  <span className="text-slate-600 font-normal">{label}</span>
                </button>
                <span className="text-slate-300 font-light select-none">|</span>
              </React.Fragment>
            );
          })}

          {/* 4.2 模型名称 (图 1: 即梦 Seedance 1.0 Fast / GPT Image 2，纯文本无边框无胶囊) */}
          <span className="text-slate-600 font-normal truncate max-w-[160px]">{modelLabel}</span>

          {/* 4.3 视频时长 或 图片画质 (图 1: 5s / 2K) */}
          {isVideo ? (
            durationLabel && (
              <>
                <span className="text-slate-300 font-light select-none">|</span>
                <span className="text-slate-500 font-normal">{durationLabel}</span>
              </>
            )
          ) : (
            qualityLabel && (
              <>
                <span className="text-slate-300 font-light select-none">|</span>
                <span className="text-slate-500 font-normal">{qualityLabel}</span>
              </>
            )
          )}

          {/* 4.4 画幅比例 (图 1: 9:16 / 3:4) */}
          {aspectRatio && (
            <>
              <span className="text-slate-300 font-light select-none">|</span>
              <span className="text-slate-500 font-normal">{aspectRatio}</span>
            </>
          )}
        </div>
      </div>

      {/* 🌟 5. 底部双按钮：[ ↺ 做同款 ] 与 [ 🖼 用作参考图 ] (1:1 对齐图 1) */}
      <div className="pt-5 mt-4 border-t border-slate-100 flex items-center gap-3">
        {/* 做同款 */}
        <button
          type="button"
          onClick={onUsePromptOnly}
          className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-transparent hover:bg-transparent hover:opacity-70 text-slate-800 font-medium text-[13.5px] sm:text-[14px] flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
          title="将当前提示词带入输入框做同款"
        >
          <RotateCcw className="w-4 h-4 text-slate-700 stroke-[2.2]" />
          <span>做同款</span>
        </button>

        {/* 用作参考图 */}
        <button
          type="button"
          onClick={onUseAsReference}
          className="flex-1 h-11 sm:h-12 rounded-xl sm:rounded-2xl bg-transparent hover:bg-transparent hover:opacity-70 text-slate-800 font-medium text-[13.5px] sm:text-[14px] flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
          title="将当前大图作为生图参考图"
        >
          <ImageIcon className="w-4 h-4 text-slate-700 stroke-[2.2]" />
          <span>{isVideo ? '用作参考素材' : '用作参考图'}</span>
        </button>
      </div>
    </div>
  );
});

export default LightboxInfoPanel;
