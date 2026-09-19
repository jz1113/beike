import React, { useState, useEffect, useMemo } from 'react';
import {
  Maximize2,
  Layers,
  Eye,
  Download,
  Sparkles,
} from 'lucide-react';
import { proxyMediaUrl } from '@/shared/api/apiClient';
import { downloadMediaOrOpen } from '@/shared/media/downloadMedia';
import { normalizeImageUrlToStandardJpg, getAspectRatioFromSize } from '@beike/domain/drawing';
import AIGeneratingCard from '@/shared/ui/AIGeneratingCard';
import DepthCarousel from '@/shared/media/DepthCarousel';
import LazyVideoCover from '@/shared/media/LazyVideoCover';
import type { AssetTaskBatch } from '../utils/assetBatch';

interface Props {
  folderBatch: AssetTaskBatch;
  isDownloadingZip?: boolean;
  setIsDownloadingZip?: (v: boolean) => void;
  showToast?: (msg: string) => void;
  setQuickPrompt?: (prompt: string) => void;
  setPreviewTask: (...args: any[]) => void;
  onClose: () => void;
  onEnterCanvas?: (projectId: string) => void;
}

// 🌟 智能比例解析器：将尺寸或标准比例字符串解析为数值宽高比 (width / height)
function parseRatioStr(sizeStr?: string): number {
  if (!sizeStr) return 3 / 4;
  const clean = sizeStr.trim();
  if (clean.includes('x')) {
    const [w, h] = clean.split('x').map(Number);
    if (w && h && !isNaN(w) && !isNaN(h)) {
      return w / h;
    }
  }
  const ratioName = getAspectRatioFromSize(clean);
  switch (ratioName) {
    case '1:1': return 1;
    case '3:4': return 3 / 4;
    case '4:3': return 4 / 3;
    case '9:16': return 9 / 16;
    case '16:9': return 16 / 9;
    case '2:3': return 2 / 3;
    case '3:2': return 3 / 2;
    case '4:5': return 4 / 5;
    case '5:4': return 5 / 4;
    case '21:9': return 21 / 9;
    default: return 3 / 4;
  }
}

/**
 * 🌟 依据真实图片宽高比动态计算 3D 展台卡片的最佳尺寸与舞台高度
 * 彻底解决固定尺寸导致的人头被裁切、四格图上下显示不全等痛点！
 */
function calculateAdaptiveCardSize(ratio: number) {
  // 依据窗口可用高度自适应视口黄金尺度（适配不同分辨率屏幕）
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  // 最大高度提升至 500px ~ 520px（占视口高度约 58%~65%），视觉更开阔大气，卡片细节清晰可见
  const maxH = Math.min(520, Math.max(440, Math.round(vh * 0.60)));
  const maxW = Math.min(640, Math.max(480, Math.round(maxH * 1.25)));

  let width: number;
  let height: number;

  if (ratio <= 1) {
    // 竖图与方图 (如 3:4, 9:16, 2:3, 1:1) - 以高度为基准铺满
    height = maxH;
    width = Math.round(height * ratio);
    // 保证极窄长图（如 9:16）的最小可视宽度
    if (width < 270) {
      width = 270;
      height = Math.round(width / ratio);
      if (height > maxH + 40) {
        height = maxH + 40;
        width = Math.round(height * ratio);
      }
    }
  } else {
    // 横图 (如 4:3, 16:9, 3:2, 21:9) - 以宽度为基准展开
    width = maxW;
    height = Math.round(width / ratio);
    if (height > maxH) {
      height = maxH;
      width = Math.round(height * ratio);
    }
  }

  // 舞台高度依据卡片高度动态延展，保留下方指示圆点舒适空间
  const stageHeight = Math.max(460, height + 40);
  // 外围容器宽度随横竖卡片适当收放，确保左右翻页键贴合边缘并有充足透气空间
  const containerMaxWidth = Math.max(620, Math.min(780, width + 190));

  return {
    cardWidth: width,
    cardHeight: height,
    stageHeight,
    containerMaxWidth,
  };
}

export default function AssetFolderOverlay({
  folderBatch,
  showToast = () => {},
  setPreviewTask,
  onClose,
  onEnterCanvas,
}: Props) {
  const [viewMode] = useState<'3d' | 'grid'>('3d');

  const isCanvasBatch = folderBatch.batchId.startsWith('canvas-project-');
  const canvasProjectId = isCanvasBatch ? folderBatch.batchId.replace('canvas-project-', '') : null;

  const firstValidTask = folderBatch.tasks.find(t => t.resultUrl) || folderBatch.tasks[0];
  const validTasks = folderBatch.tasks.filter(t => t.resultUrl);

  // 🌟 优先通过首张图片的实际加载像素探测其真实物理比例（0 误差完美契合）
  const [detectedRatio, setDetectedRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!firstValidTask?.resultUrl) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setDetectedRatio(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = proxyMediaUrl(normalizeImageUrlToStandardJpg(firstValidTask.resultUrl), { thumb: true, width: 320 });
  }, [firstValidTask?.resultUrl]);

  // 🌟 未探测前使用规格声明（如 3:4 / 1760x2348 等）兜底，保障瞬时打开即准确
  const taskSize = firstValidTask?.size || (firstValidTask as any)?.aspectRatio || folderBatch.size;
  const activeRatio = detectedRatio || parseRatioStr(taskSize);

  // 🌟 动态卡片规格与舞台尺寸
  const { cardWidth, cardHeight, stageHeight, containerMaxWidth } = useMemo(
    () => calculateAdaptiveCardSize(activeRatio),
    [activeRatio]
  );

  const carouselItems = validTasks.map((t, idx) => ({
    // 🌟 使用与列表卡片同源的高清缩略图（640px Retina 高清），大图展示细腻无颗粒感
    image: proxyMediaUrl(normalizeImageUrlToStandardJpg(t.resultUrl), { thumb: true, width: 640 }),
    rawUrl: normalizeImageUrlToStandardJpg(t.resultUrl),
    alt: t.prompt || `第 ${idx + 1} 张`,
    title: `Shot #${idx + 1}`,
    task: t,
  }));

  // 支持键盘 Esc 退出
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/10 backdrop-blur-[2px] animate-fade-in select-none overflow-hidden"
      onClick={onClose}
    >
      {/* 🌟 核心向内收缩集群（不占全屏，四周向内聚拢，根据图片比例自适应宽度） */}
      <div 
        className="w-full flex flex-col items-center gap-3 transition-all duration-300 animate-scale-up"
        style={{ maxWidth: viewMode === '3d' ? `${containerMaxWidth}px` : '56rem' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 🌟 核心舞台区：紧凑收缩至中央，依据图片真实比例自适应宽高（杜绝裁剪） */}
        {viewMode === '3d' && carouselItems.length > 0 ? (
          <div 
            className="w-full flex items-center justify-center relative overflow-visible transition-all duration-300"
            style={{ height: `${stageHeight}px` }}
          >
            <DepthCarousel
              items={carouselItems}
              cardWidth={cardWidth}
              cardHeight={cardHeight}
              radius={20}
              depth={170}
              spread={46}
              tilt={18}
              tiltDirection="right"
              perspective={1400}
              visibleCards={3}
              duration={600}
              showControls={true}
              showIndicators={true}
              onItemClick={(idx, item) => {
                const targetTask = (item as any)?.task || validTasks[idx] || firstValidTask;
                if (targetTask?.resultUrl) {
                  setPreviewTask(targetTask, folderBatch.tasks);
                  onClose();
                }
              }}
            />
          </div>
        ) : (
          /* 平铺网格模式 */
          <div className="w-full p-4 rounded-3xl bg-white/90 backdrop-blur-xl border border-white/80 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.12)] max-h-[75vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-3 text-slate-600">
              <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-slate-900">
                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  {isCanvasBatch ? '画布项目内容清单' : '套组可用图片清单'} ({validTasks.length}
                  {folderBatch.tasks.filter(t => t.status === 'FAILURE' && !t.resultUrl).length > 0
                    ? ` · ${folderBatch.tasks.filter(t => t.status === 'FAILURE' && !t.resultUrl).length} 张失败`
                    : ''}
                  )
                </span>
              </h4>
              <div className="flex items-center gap-2">
                {isCanvasBatch && canvasProjectId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onEnterCanvas) onEnterCanvas(canvasProjectId);
                    }}
                    className="px-3 py-1 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-indigo-200" />
                    <span>进入该画布编辑</span>
                  </button>
                )}
                <span className="text-[11px] text-slate-400">点击任意图片可放大查看</span>
              </div>
            </div>

            <div className={`grid ${folderBatch.tasks.length === 4 ? 'grid-cols-2 sm:grid-cols-4' : folderBatch.tasks.length === 3 ? 'grid-cols-3' : folderBatch.tasks.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'} gap-4`}>
              {folderBatch.tasks.map((task, idx) => (
                <div
                  key={task.id}
                  onClick={() => {
                    if (task.resultUrl) {
                      setPreviewTask(task, folderBatch.tasks);
                      onClose();
                    }
                  }}
                  className={`group relative rounded-2xl overflow-hidden bg-slate-100 border aspect-square shadow-sm transition-all ${
                    task.resultUrl
                      ? 'cursor-pointer hover:shadow-xl hover:border-indigo-300 hover:-translate-y-1 border-slate-200'
                      : 'cursor-default border-red-200/80 bg-red-50/20'
                  }`}
                >
                  <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-white text-[9px] font-mono font-bold">
                    #{idx + 1}
                  </div>

                  {task.resultUrl ? (
                    (task.mediaType === 'video' || task.mediaType === 'depth-video' || task.resultUrl.includes('.mp4')) ? (
                      <LazyVideoCover src={proxyMediaUrl(task.resultUrl)} />
                    ) : (
                      <img 
                        src={proxyMediaUrl(normalizeImageUrlToStandardJpg(task.resultUrl), { thumb: true, width: 320 })} 
                        alt="" 
                        loading="lazy" 
                        decoding="async" 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" 
                      />
                    )
                  ) : task.status === 'FAILURE' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-red-500">
                      <span className="text-xs font-bold">生成失败</span>
                      <span className="text-[9px] text-slate-400 line-clamp-2 mt-1 px-1">
                        {task.failReason || '任务处理异常'}
                      </span>
                    </div>
                  ) : (
                    <AIGeneratingCard task={task} variant="lite" showProgressBadge={true} />
                  )}

                  {/* Hover overlay */}
                  {task.resultUrl && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                      <p className="text-[10px] text-white/90 line-clamp-2">{task.prompt || '无提示词'}</p>
                      <div className="flex items-center justify-between text-white text-[10px] mt-1">
                        <span className="font-bold flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          <span>放大查看</span>
                        </span>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!task.resultUrl) return;
                            const isVid = task.mediaType === 'video' || task.mediaType === 'depth-video' || task.resultUrl.includes('.mp4');
                            const ext = isVid ? 'mp4' : 'png';
                            const filename = `beikeyuntu_${isVid ? 'video' : 'image'}_shot_${idx + 1}_${Date.now()}.${ext}`;
                            showToast('📥 正在下载素材...');
                            await downloadMediaOrOpen(task.resultUrl, filename);
                            showToast(`🎉 已成功保存素材`);
                          }}
                          className="p-1 rounded-md bg-white/20 hover:bg-white text-white hover:text-slate-900 transition-colors"
                          title="下载此张"
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🌟 底部操作按钮 */}
        <div className="w-full flex items-center justify-center gap-3 pt-3.5 shrink-0">
          {isCanvasBatch && canvasProjectId && (
            <button
              type="button"
              onClick={() => {
                if (onEnterCanvas) {
                  onEnterCanvas(canvasProjectId);
                } else {
                  onClose();
                }
              }}
              className="px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_8px_24px_-4px_rgba(79,70,229,0.4)] hover:shadow-indigo-500/30 hover:scale-105 cursor-pointer shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <span>进入该画布编辑</span>
            </button>
          )}

          {viewMode === '3d' && (
            <button
              type="button"
              onClick={() => {
                if (firstValidTask?.resultUrl) {
                  setPreviewTask(firstValidTask, folderBatch.tasks);
                }
                onClose();
              }}
              className="px-4 py-2 rounded-full bg-white/90 hover:bg-white text-slate-800 hover:text-indigo-600 text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)] hover:shadow-indigo-500/20 hover:scale-105 border border-white/90 backdrop-blur-xl cursor-pointer shrink-0"
            >
              <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>大图逐张查看</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
