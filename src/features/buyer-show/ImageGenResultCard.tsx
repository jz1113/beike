'use client';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Maximize2,
  Pencil,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import AIGeneratingCard from '@/shared/ui/AIGeneratingCard';
import { proxyMediaUrl } from '@/lib/apiClient';
import { cleanPromptText, normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import type { GenerationTask } from '@/store/useAppStore';

/** 列表预览固定 3:4，与生图 API 比例解耦；完整比例见 lightbox */
const PREVIEW_ASPECT_CLASS = 'aspect-[3/4]';

interface ImageGenResultCardProps {
  task: GenerationTask;
  idx: number;
  selectedAspectId: string;
  workshopMode: string;
  isReconstructingId: string | null;
  onOpenLightbox: (url: string, title: string) => void;
  onOpenPromptEditor: (task: GenerationTask) => void;
  onReconstructShot: (task: GenerationTask) => void;
  onDownload: (url: string, filename: string) => void;
  onGenerateSingle: (task: GenerationTask) => void;
}

export default function ImageGenResultCard({
  task,
  idx,
  selectedAspectId,
  workshopMode,
  isReconstructingId,
  onOpenLightbox,
  onOpenPromptEditor,
  onReconstructShot,
  onDownload,
  onGenerateSingle,
}: ImageGenResultCardProps) {
  const shotLabel = task.shotNo || idx + 1;
  const expressionAction =
    workshopMode !== 'social_face_product_swap' && (task.expression || task.action)
      ? [task.expression, task.action].filter(Boolean).join(' · ')
      : null;
  const showProductLock = task.productImageUrl && task.useReferenceImage !== false;

  return (
    <div
      className={`group rounded-3xl overflow-hidden border-2 transition-all duration-500 bg-white shadow-md hover:shadow-xl flex flex-col ${
        task.status === 'IN_PROGRESS'
          ? 'border-indigo-500 ring-4 ring-indigo-500/20 shadow-xl'
          : task.status === 'SUCCESS'
          ? 'border-slate-200 hover:border-indigo-400 hover:shadow-lg'
          : task.status === 'FAILURE'
          ? 'border-red-300 ring-2 ring-red-500/10'
          : 'border-slate-200 hover:border-indigo-400 hover:shadow-md'
      }`}
    >
      {/* 单行紧凑顶栏 */}
      <div className="px-3 py-1.5 border-b border-slate-100 bg-white flex-shrink-0 flex items-center gap-2 min-w-0">
        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 shrink-0">
          SHOT {shotLabel}
        </span>
        <span
          className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-mono font-bold border border-slate-200 shrink-0"
          title={`生图比例 ${selectedAspectId}`}
        >
          {selectedAspectId}
        </span>
        {expressionAction ? (
          <p
            className="flex-1 min-w-0 text-[11px] text-slate-600 truncate"
            title={expressionAction}
          >
            {expressionAction}
          </p>
        ) : (
          <span className="flex-1 min-w-0" />
        )}
        <div className="flex items-center gap-1.5 shrink-0">
          {showProductLock && (
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 whitespace-nowrap">
              锁定商品
            </span>
          )}
          {task.productImageUrl && (
            <button
              type="button"
              className="w-6 h-6 rounded-lg overflow-hidden border border-slate-200 shadow-xs bg-slate-100 cursor-pointer hover:scale-110 transition-transform"
              title="点击查看本分镜绑定的商品实物图 (生图模型将严格以此图作为实物参考)"
              onClick={() =>
                onOpenLightbox(
                  task.productImageUrl!,
                  `分镜 ${shotLabel} 绑定的商品实物图`,
                )
              }
            >
              <img
                src={normalizeImageUrlToStandardJpg(task.productImageUrl)}
                alt="实物垫图"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.hasRetried && task.productImageUrl) {
                    target.dataset.hasRetried = 'true';
                    target.src = proxyMediaUrl(task.productImageUrl);
                  }
                }}
                className="w-full h-full object-cover"
              />
            </button>
          )}
          {task.status && task.status !== 'IDLE' && (
            <span
              className={`px-1.5 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                task.status === 'SUCCESS'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : task.status === 'IN_PROGRESS'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {task.status === 'SUCCESS' && <CheckCircle2 className="w-3 h-3" />}
              {task.status === 'IN_PROGRESS' && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>
                {task.status === 'SUCCESS'
                  ? '已生成'
                  : task.status === 'IN_PROGRESS'
                  ? '渲染中'
                  : '失败'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* 紧凑预览画布（固定 3:4，object-cover 裁剪） */}
      <div
        className={`relative w-full overflow-hidden bg-gradient-to-b from-white via-slate-50 to-indigo-50/20 ${PREVIEW_ASPECT_CLASS}`}
      >
        {task.status === 'SUCCESS' && task.resultUrl ? (
          <>
            <img
              src={task.resultUrl}
              alt={task.title}
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.hasRetried && task.resultUrl) {
                  target.dataset.hasRetried = 'true';
                  target.src = proxyMediaUrl(task.resultUrl);
                }
              }}
              onClick={() => {
                onOpenLightbox(task.resultUrl!, task.title);
              }}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer"
            />

            <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-xs flex flex-col justify-between p-4 z-10 pointer-events-none">
              <div className="pt-2 flex flex-col space-y-1 pointer-events-auto">
                <div className="text-xs font-bold text-white truncate drop-shadow-sm">
                  {task.title}
                </div>
                <div
                  onClick={() => onOpenPromptEditor(task)}
                  className="text-[11px] text-slate-300 font-mono line-clamp-2 hover:text-indigo-200 transition-colors cursor-pointer"
                  title="点击查看/精修完整提示词"
                >
                  {cleanPromptText(task.prompt)}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/15 pointer-events-auto">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isReconstructingId === task.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onReconstructShot(task);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-indigo-600 text-white border border-white/20 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                    title="调用视觉大模型重新规划此分镜机位"
                  >
                    {isReconstructingId === task.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3 text-indigo-300" />
                    )}
                    <span>AI换机位</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenPromptEditor(task)}
                    className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/30 text-white border border-white/20 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                    title="精修提示词"
                  >
                    <Pencil className="w-3 h-3 text-indigo-300" />
                    <span>编辑词</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenLightbox(task.resultUrl!, task.title);
                    }}
                    className="p-1.5 rounded-xl bg-white/15 hover:bg-white/30 text-white border border-white/20 text-xs transition-all cursor-pointer active:scale-95 shadow-sm"
                    title="全屏大图预览"
                  >
                    <Maximize2 className="w-4 h-4 text-white" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDownload(task.resultUrl!, `buyer_show_shot_${task.shotNo}`)}
                    className="p-1.5 rounded-xl bg-white/15 hover:bg-emerald-600 text-white border border-white/20 text-xs transition-all cursor-pointer active:scale-95 shadow-sm"
                    title="下载高清原图"
                  >
                    <Download className="w-4 h-4 text-emerald-300" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onGenerateSingle(task)}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-md"
                    title="重新渲染此分镜"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-white" />
                    <span>重生</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : task.status === 'IN_PROGRESS' ? (
          <AIGeneratingCard task={task} isVideo={false} embedded={true} className="absolute inset-0 w-full h-full" />
        ) : task.status === 'FAILURE' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 text-center space-y-3 text-red-500 animate-fade-in overflow-y-auto overflow-x-hidden">
            <AlertCircle className="w-10 h-10 opacity-80 text-red-500 shrink-0" />
            <div className="text-xs font-bold text-slate-800">渲染遇到异常</div>
            <div
              className="text-[11px] text-red-500 font-mono w-full min-w-0 max-w-full break-words [overflow-wrap:anywhere] leading-relaxed text-left"
              title={task.failReason}
            >
              {task.failReason}
            </div>
            <button
              type="button"
              onClick={() => onGenerateSingle(task)}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
            >
              重试生成
            </button>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center select-none bg-slate-50/40 gap-2">
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-400 shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenPromptEditor(task)}
                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-bold transition-all cursor-pointer shadow-sm"
              >
                编辑词
              </button>
              <button
                type="button"
                onClick={() => onGenerateSingle(task)}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold transition-all cursor-pointer shadow-md"
              >
                生成此分镜
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
