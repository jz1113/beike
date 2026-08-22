'use client';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCw,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import type { GenerationTask } from '@/store/useAppStore';
import { proxyMediaUrl } from '@/lib/apiClient';
import ImageGenResultCard from './ImageGenResultCard';
import type { OriginalGenPhase } from './originalGenPhase';
import { originalGenPhaseLabel } from './originalGenPhase';

interface ImageGenTaskGridProps {
  socialPromptStale: boolean;
  onBackToStep2: () => void;
  totalCount: number;
  successCount: number;
  inProgressCount: number;
  initGenerationTasks: (forceReset?: boolean) => void;
  handleBatchGenerate: () => void;
  isBatchGenerating: boolean;
  generationTasks: GenerationTask[];
  hideChromeNav?: boolean;
  onNextToStep4: () => void;
  modelPersona?: string | null;
  isAnchorFaceConfirmed: boolean;
  setAnchorFaceImageUrl: (url: string | undefined) => void;
  setIsAnchorFaceConfirmed: (v: boolean) => void;
  handleGenerateSingle: (task: GenerationTask) => void;
  anchorFaceImageUrl?: string;
  setActiveLightboxImage: (url: string | null) => void;
  setActiveLightboxTitle: (title: string) => void;
  selectedAspectId: string;
  workshopMode: string;
  isReconstructingId: string | null;
  handleOpenPromptEditor: (task: GenerationTask) => void;
  handleReconstructShotWithAI: (task: GenerationTask) => void;
  handleDownload: (url: string, filename: string) => void;
  /** 原创阶段（用于画布提示） */
  originalPhase?: OriginalGenPhase | null;
  /** 顶栏已承接主 CTA 时，隐藏画布主色「批量生图」 */
  hidePrimaryBatchCta?: boolean;
  /** 设置页是否已有启用的生图模型 */
  imageModelsReady?: boolean;
}

export default function ImageGenTaskGrid({
  socialPromptStale,
  onBackToStep2,
  totalCount,
  successCount,
  inProgressCount,
  initGenerationTasks,
  handleBatchGenerate,
  isBatchGenerating,
  generationTasks,
  hideChromeNav,
  onNextToStep4,
  modelPersona,
  isAnchorFaceConfirmed,
  setAnchorFaceImageUrl,
  setIsAnchorFaceConfirmed,
  handleGenerateSingle,
  anchorFaceImageUrl,
  setActiveLightboxImage,
  setActiveLightboxTitle,
  selectedAspectId,
  workshopMode,
  isReconstructingId,
  handleOpenPromptEditor,
  handleReconstructShotWithAI,
  handleDownload,
  originalPhase,
  hidePrimaryBatchCta,
  imageModelsReady = true,
}: ImageGenTaskGridProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-[#F8F9FC]">
      {socialPromptStale && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 flex-shrink-0">
          <span>
            参考图已变更，当前分镜提示词已失效。请先回到 Step2 重新视觉分析后再生图，避免旧词新图乱生成。
          </span>
          <button
            type="button"
            onClick={onBackToStep2}
            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold whitespace-nowrap cursor-pointer"
          >
            回 Step2 重分析
          </button>
        </div>
      )}
      {/* Top Action Bar */}
      <div className="h-16 px-6 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl flex items-center justify-between flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            生图画布
          </h3>
          <p className="text-[11px] text-slate-500">
            共 {totalCount} 个 · 成功 {successCount} · 进行中 {inProgressCount}
            {originalPhase && workshopMode !== 'social_face_product_swap' ? (
              <span className="text-indigo-600 font-semibold">
                {' '}
                · 当前：{originalGenPhaseLabel(originalPhase, { successCount, restCount: totalCount - successCount })}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {successCount > 0 && (
            <button
              type="button"
              onClick={() => initGenerationTasks(true)}
              className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
              title="重置画布"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          {/* 顶栏承接主 CTA 时：仅保留次要「全部重新生成」 */}
          {hidePrimaryBatchCta ? (
            successCount > 0 && (
              <button
                type="button"
                onClick={handleBatchGenerate}
                disabled={isBatchGenerating || generationTasks.length === 0 || socialPromptStale || !imageModelsReady}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 disabled:opacity-40"
              >
                {isBatchGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>全部重新生成</span>
              </button>
            )
          ) : (
            <button
              onClick={handleBatchGenerate}
              disabled={isBatchGenerating || generationTasks.length === 0 || socialPromptStale || !imageModelsReady}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                socialPromptStale
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : successCount === 0
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
              }`}
            >
              {isBatchGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : successCount === 0 ? (
                <Zap className="w-3.5 h-3.5 text-amber-300" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>
                {isBatchGenerating
                  ? `生成中 (${inProgressCount}/${totalCount})...`
                  : successCount === 0
                  ? `批量生图 (${totalCount})`
                  : '全部重新生成'}
              </span>
            </button>
          )}

          {!hideChromeNav && (
          <button
            onClick={onNextToStep4}
            disabled={successCount === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm disabled:opacity-40 cursor-pointer"
          >
            <span>下一步：导出 ({successCount})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          )}
        </div>
      </div>

      {/* Tasks Gallery Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto pb-24">
          {/* 智能分支交互卡片：有模特场景展示两阶段定脸卡片；纯静物场景展示全量并发卡片 */}
          {generationTasks.length > 0 && (() => {
            const isNoModel = !modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物');
            const hasAnyHuman = !isNoModel && generationTasks.some(t => t.has_human === true || (t.has_human !== false && (t.shot_type === 'model_shot' || !t.shot_type)));
            const task1 = generationTasks[0];

            if (!hasAnyHuman) {
              return (
                <div className="mb-6 p-4 rounded-2xl bg-white border border-slate-200 flex items-center gap-4 shadow-2xs animate-fade-in">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span>纯商品模式</span>
                        <span className="px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          可并发
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        无人物模特。请使用顶栏主按钮开始渲染。
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            if (!isAnchorFaceConfirmed) {
              if (task1?.status === 'SUCCESS' && task1.resultUrl) {
                return (
                  <div className="mb-6 p-4.5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          首图已出：确认是否作为全套基准面孔
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-600 font-bold bg-slate-100 px-2 py-0.5 rounded-md">
                        锁定后后续分镜保持同一人脸
                      </span>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                      <img 
                        src={task1.resultUrl} 
                        alt="首图人脸" 
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.dataset.hasRetried && task1.resultUrl) {
                            target.dataset.hasRetried = 'true';
                            target.src = proxyMediaUrl(task1.resultUrl);
                          }
                        }}
                        className="w-20 h-20 rounded-xl object-cover border border-slate-200 shadow-xs flex-shrink-0 cursor-pointer"
                        onClick={() => {
                          setActiveLightboxImage(task1.resultUrl || '');
                          setActiveLightboxTitle('分镜 1 模特基准面孔');
                        }}
                      />
                      <div className="flex-1 space-y-1">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <span>分镜 1 基准面孔</span>
                          <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold border border-emerald-200">
                            出图成功
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 leading-relaxed">
                          确认后人脸将作为后续分镜一致性参考；不满意可重新生成首图。
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setAnchorFaceImageUrl(task1.resultUrl);
                            setIsAnchorFaceConfirmed(true);
                          }}
                          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>确认此人脸</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleGenerateSingle(task1)}
                          className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>重新定脸</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div className="mb-6 p-4.5 rounded-2xl bg-white border border-slate-200 flex items-center justify-between gap-4 animate-fade-in">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                          <span>先生成分镜 1 定脸</span>
                          <span className="px-2 py-0.2 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                            第 1 步
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          含人物场景请先出首图确认面孔，再批量生成后续分镜。
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => task1 && handleGenerateSingle(task1)}
                      disabled={task1?.status === 'IN_PROGRESS'}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 transition-all active:scale-95"
                    >
                      {task1?.status === 'IN_PROGRESS' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      <span>{task1?.status === 'IN_PROGRESS' ? '正在生成首图...' : '生成分镜 1'}</span>
                    </button>
                  </div>
                );
              }
            } else {
              return (
                <div className="mb-6 p-4.5 rounded-2xl bg-white border border-emerald-200 flex items-center justify-between gap-4 shadow-sm animate-fade-in">
                  <div className="flex items-center gap-3.5">
                    <img 
                      src={anchorFaceImageUrl} 
                      alt="基准人脸" 
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.dataset.hasRetried && anchorFaceImageUrl) {
                          target.dataset.hasRetried = 'true';
                          target.src = proxyMediaUrl(anchorFaceImageUrl);
                        }
                      }}
                      className="w-12 h-12 rounded-xl object-cover border border-emerald-300 shadow-xs flex-shrink-0 cursor-pointer"
                      onClick={() => {
                        setActiveLightboxImage(anchorFaceImageUrl || '');
                        setActiveLightboxTitle('已绑定的模特基准面孔');
                      }}
                    />
                    <div>
                      <div className="text-xs sm:text-sm font-bold text-emerald-950 flex items-center gap-2">
                        <span>专属真人面容已锁定</span>
                        <span className="px-2 py-0.2 rounded-full bg-emerald-200 text-emerald-800 text-[10px] font-bold">
                          已绑定
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        人物镜将使用此正脸定 ID。请使用顶栏主按钮继续生成其余分镜。
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAnchorFaceImageUrl(undefined);
                      setIsAnchorFaceConfirmed(false);
                    }}
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-emerald-200 text-emerald-800 text-xs font-medium cursor-pointer transition-colors flex-shrink-0"
                  >
                    更换人脸
                  </button>
                </div>
              );
            }
          })()}

          {/* Modern Clean Minimalist Gallery Grid (纯净无杂质沉浸画廊) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {generationTasks.map((task, idx) => (
            <ImageGenResultCard
              key={task.id}
              task={task}
              idx={idx}
              selectedAspectId={selectedAspectId}
              workshopMode={workshopMode}
              isReconstructingId={isReconstructingId}
              onOpenLightbox={(url, title) => {
                setActiveLightboxImage(url);
                setActiveLightboxTitle(title);
              }}
              onOpenPromptEditor={handleOpenPromptEditor}
              onReconstructShot={handleReconstructShotWithAI}
              onDownload={handleDownload}
              onGenerateSingle={handleGenerateSingle}
            />
          ))}
          </div>
        </div>
      </div>
    </div>
  );
}
