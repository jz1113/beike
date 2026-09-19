import React from 'react';

interface FeedBatchHeaderProps {
  displayBatchTitle: string;
  batchPrompt: string;
  isBatchVideo: boolean;
  displayModel: string;
  displayRatio: string;
  displayQuality: string;
  isMultiAngle?: boolean;
  angleName?: string;
  isSmartEdit?: boolean;
  sourceImageUrl?: string;
  onPreviewSourceImage?: (url: string) => void;
  onShowDetails?: () => void;
}

export default function FeedBatchHeader({
  displayBatchTitle,
  batchPrompt,
  isBatchVideo,
  displayModel,
  displayRatio,
  displayQuality,
  isMultiAngle,
  angleName,
  isSmartEdit,
  sourceImageUrl,
  onPreviewSourceImage,
  onShowDetails,
}: FeedBatchHeaderProps) {
  return (
    <div className="flex items-center gap-x-2.5 w-full max-w-full px-0.5 text-xs select-none flex-wrap gap-y-1 min-h-10">
      {/* 🌟 模式 1: 多角度视角转换任务，展示 [🎥 多角度] 与 [🖼 image] 胶囊 */}
      {isMultiAngle ? (
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 胶囊 1: [ 🎥 多角度 ] */}
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/90 dark:bg-zinc-800/90 border border-slate-200/80 dark:border-zinc-700/80 text-slate-700 dark:text-zinc-200 text-[11.5px] font-medium shadow-xs select-none transition-colors"
            title={angleName ? `机位: ${angleName}` : '多角度相机视角'}
          >
            {/* 多角度三维立体相机微缩图标 */}
            <span className="w-3.5 h-3.5 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
            <span>{angleName ? `多角度 · ${angleName}` : '多角度'}</span>
          </div>

          {/* 胶囊 2: [ 🖼 image ] 原图参考胶囊 (可点击直接放大原图) */}
          {sourceImageUrl && (
            <button
              type="button"
              onClick={() => onPreviewSourceImage?.(sourceImageUrl)}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100/90 hover:bg-slate-200/90 dark:bg-zinc-800/90 dark:hover:bg-zinc-700/90 border border-slate-200/80 dark:border-zinc-700/80 text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white text-[11.5px] font-medium shadow-xs cursor-pointer transition-colors"
              title="基于此原图生成，点击查看基准原图"
            >
              <img
                src={sourceImageUrl}
                alt="原参考图"
                className="w-3.5 h-3.5 rounded-xs object-cover border border-black/10 shrink-0"
              />
              <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400">image</span>
            </button>
          )}
        </div>
      ) : isSmartEdit ? (
        /* 🌟 模式 2: 智能改图局部重绘任务，展示 [🎨 智能改图] 与 [🖼 原图] 胶囊 */
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100/90 dark:bg-zinc-800/90 border border-slate-200/80 dark:border-zinc-700/80 text-slate-700 dark:text-zinc-200 text-[11.5px] font-medium shadow-xs select-none transition-colors"
            title="智能局部改图重绘任务"
          >
            <span className="w-3.5 h-3.5 flex items-center justify-center text-[#007AFF]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
              </svg>
            </span>
            <span>智能改图</span>
          </div>

          {sourceImageUrl && (
            <button
              type="button"
              onClick={() => onPreviewSourceImage?.(sourceImageUrl)}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100/90 hover:bg-slate-200/90 dark:bg-zinc-800/90 dark:hover:bg-zinc-700/90 border border-slate-200/80 dark:border-zinc-700/80 text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white text-[11.5px] font-medium shadow-xs cursor-pointer transition-colors"
              title="基于此原图局部重绘，点击查看基准原图"
            >
              <img
                src={sourceImageUrl}
                alt="原参考图"
                className="w-3.5 h-3.5 rounded-xs object-cover border border-black/10 shrink-0"
              />
              <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400">原图</span>
            </button>
          )}
        </div>
      ) : (
        /* 默认模式：提示词标题 (单行截断) */
        <span
          className="font-medium text-slate-800 dark:text-zinc-200 text-[13px] sm:text-[13.5px] truncate shrink min-w-0 max-w-xs sm:max-w-md lg:max-w-lg"
          title={batchPrompt}
        >
          {displayBatchTitle}
        </span>
      )}

      {/* 参数规格: 模型 | 画幅比例 | 分辨率 | 详细信息 ⓘ */}
      <div className="flex items-center gap-x-2 text-[12px] sm:text-[12.5px] text-slate-600 dark:text-zinc-400 font-medium font-sans shrink-0 whitespace-nowrap">
        <span>{isBatchVideo ? `视频 ${displayModel}` : displayModel}</span>
        <span className="text-slate-300 dark:text-zinc-600 font-light select-none">|</span>
        <span>{displayRatio}</span>
        <span className="text-slate-300 dark:text-zinc-600 font-light select-none">|</span>
        <span>{displayQuality}</span>

        {/* 详细信息 ⓘ (图3标杆同款) */}
        {onShowDetails && (
          <>
            <span className="text-slate-300 dark:text-zinc-600 font-light select-none">|</span>
            <button
              type="button"
              onClick={onShowDetails}
              className="inline-flex items-center gap-1 text-slate-500 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400 cursor-pointer transition-colors"
              title="查看生成提示词与详细机位参数"
            >
              <span>详细信息</span>
              <span className="w-3 h-3 flex items-center justify-center text-[10px] rounded-full border border-current font-serif font-bold italic leading-none">
                i
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

