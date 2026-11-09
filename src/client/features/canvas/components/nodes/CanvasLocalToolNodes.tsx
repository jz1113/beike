import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeftRight,
  CheckCircle2,
  Columns2,
  Download,
  Eye,
  FileText,
  Film,
  FolderArchive,
  GitCompare,
  Grid2X2,
  Layers,
  LayoutGrid,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Scan,
  Tv,
  X,
} from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { downloadMediaOrOpen } from '@client/shared/media/downloadMedia';
import { extractVideoFrame } from '../../model/canvasVideoFrame';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode } from '../../model/types';
import { CanvasTableEditorNode } from './CanvasTableEditorNode';

interface SimpleNodeProps {
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
  selected?: boolean;
}

type CompareMode = NonNullable<CanvasNode['compareMode']>;

const COMPARE_MODE_ITEMS: Array<{ mode: CompareMode; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { mode: 'split', label: '滑动对比', Icon: Columns2 },
  { mode: 'side-by-side', label: '并排对比', Icon: LayoutGrid },
  { mode: 'overlay', label: '叠加对比', Icon: Layers },
  { mode: 'tap', label: '点按', Icon: Eye },
];

export const CanvasCompareNode: React.FC<SimpleNodeProps> = ({ node, nodes, projectId, selected }) => {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const [swapped, setSwapped] = useState(false);
  const [tapShowFirst, setTapShowFirst] = useState(true);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const linkedNodes = (node.referenceNodeIds || []).map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as CanvasNode[];
  const linkedImages = linkedNodes.map((n) => n.imageUrl || n.referenceImageUrl).filter(Boolean) as string[];

  const rawFirst = linkedImages[0] || node.compareBeforeUrl || node.referenceImageUrl || node.imageUrl;
  const rawSecond = linkedImages[1] || node.compareAfterUrl;
  const hasSecond = Boolean(rawSecond);
  const firstImage = swapped && hasSecond ? rawSecond : rawFirst;
  const secondImage = swapped && hasSecond ? rawFirst : rawSecond || rawFirst;

  const split = Math.max(0, Math.min(100, node.compareSplit ?? 50));
  const mode: CompareMode = node.compareMode || 'split';

  const setSplit = useCallback(
    (next: number) => updateNode(projectId, node.id, { compareSplit: Math.max(0, Math.min(100, Math.round(next))) }),
    [node.id, projectId, updateNode],
  );

  const setMode = useCallback(
    (nextMode: CompareMode) => updateNode(projectId, node.id, { compareMode: nextMode }),
    [node.id, projectId, updateNode],
  );

  const updateFromClientX = useCallback(
    (clientX: number, targetEl: HTMLDivElement | null) => {
      if (!targetEl) return;
      const rect = targetEl.getBoundingClientRect();
      if (rect.width > 0) setSplit(((clientX - rect.left) / rect.width) * 100);
    },
    [setSplit],
  );

  const startDrag = useCallback(
    (e: React.MouseEvent, targetEl: HTMLDivElement | null) => {
      e.preventDefault();
      e.stopPropagation();
      updateFromClientX(e.clientX, targetEl);
      const onMove = (ev: MouseEvent) => updateFromClientX(ev.clientX, targetEl);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [updateFromClientX],
  );

  const handleSliderKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setSplit(split - step); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); setSplit(split + step); }
      else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); setSplit(0); }
      else if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); setSplit(100); }
    },
    [setSplit, split],
  );

  const toolbar = selected ? (
    <div
      data-image-compare-toolbar="true"
      className="canvas-node-toolbar absolute -top-14 left-1/2 -translate-x-1/2 flex items-center bg-[#1a1a1a]/95 backdrop-blur-md border border-zinc-800 rounded-full px-3 py-1.5 shadow-2xl gap-1 z-50 whitespace-nowrap"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {COMPARE_MODE_ITEMS.map(({ mode: itemMode, label, Icon }) => {
        const active = mode === itemMode;
        return (
          <div key={itemMode} className="relative group/tip">
            <button
              type="button"
              aria-label={label}
              aria-pressed={active}
              onClick={() => setMode(itemMode)}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                active ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <Icon size={15} />
            </button>
            <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-zinc-900/95 text-zinc-200 text-[10px] rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity border border-zinc-700/80">
              {label}
            </div>
          </div>
        );
      })}
      <div className="w-px h-3.5 bg-zinc-800 mx-0.5" />
      <div className="relative group/tip">
        <button
          type="button"
          aria-label="全屏"
          disabled={!firstImage}
          onClick={() => setFullscreenOpen(true)}
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          <Maximize2 size={15} />
        </button>
        <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-zinc-900/95 text-zinc-200 text-[10px] rounded whitespace-nowrap opacity-0 group-hover/tip:opacity-100 transition-opacity border border-zinc-700/80">
          全屏
        </div>
      </div>
    </div>
  ) : null;

  const renderViewport = (viewportRef: React.RefObject<HTMLDivElement | null>, isFullscreen = false) => {
    if (!firstImage) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 bg-[#1f1f1f]/50 rounded-2xl border border-zinc-800 border-dashed">
          <GitCompare size={24} className="mb-2 opacity-50" />
          <span className="text-xs font-medium">连接图片以对比</span>
          {linkedNodes.length > 0 && (
            <span className="mt-1 text-[10px] text-zinc-500">已连接 {linkedNodes.length} 个上游节点，等待生成图片…</span>
          )}
        </div>
      );
    }

    return (
      <div
        ref={viewportRef}
        className={`relative h-full w-full overflow-hidden rounded-2xl border border-zinc-800 bg-[#09090b] select-none group ${
          mode === 'tap' ? 'cursor-pointer' : mode === 'side-by-side' ? 'cursor-default' : 'cursor-ew-resize'
        }`}
        onClick={
          mode === 'tap'
            ? (e) => {
                e.stopPropagation();
                setTapShowFirst((v) => !v);
              }
            : undefined
        }
      >
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'conic-gradient(#333 90deg, transparent 90deg), conic-gradient(transparent 90deg, #333 90deg)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 8px 8px',
          }}
        />
        {!hasSecond && (
          <div className="pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-medium text-zinc-300 backdrop-blur-sm border border-white/10">
            再连接一张图片开始对比
          </div>
        )}
        {hasSecond && (
          <button
            type="button"
            aria-label="交换左右"
            title="交换左右"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setSwapped((v) => !v);
            }}
            className="nodrag absolute top-2 right-2 z-20 flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-black/55 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/75 cursor-pointer"
          >
            <ArrowLeftRight size={12} />
          </button>
        )}

        {mode === 'side-by-side' ? (
          <div className="relative z-10 grid h-full w-full grid-cols-2 gap-1 bg-black/70 p-1">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-black/50">
              <img
                src={proxyMediaUrl(firstImage)}
                alt="原始图片"
                className="h-full w-full object-contain pointer-events-none"
                draggable={false}
              />
              <span className="pointer-events-none absolute bottom-2 left-2 rounded border border-white/10 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
                原始
              </span>
            </div>
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-black/50">
              {hasSecond && secondImage ? (
                <img
                  src={proxyMediaUrl(secondImage)}
                  alt="对比图片"
                  className="h-full w-full object-contain pointer-events-none"
                  draggable={false}
                />
              ) : (
                <span className="text-[11px] text-zinc-500">等待第 2 张图片</span>
              )}
              <span className="pointer-events-none absolute bottom-2 right-2 rounded border border-white/10 bg-blue-600/80 px-2 py-0.5 text-[10px] font-medium text-white">
                生成
              </span>
            </div>
          </div>
        ) : mode === 'tap' ? (
          <div className="relative z-10 h-full w-full">
            <img
              src={proxyMediaUrl((tapShowFirst || !hasSecond ? firstImage : secondImage) || firstImage)}
              alt={tapShowFirst || !hasSecond ? '原始图片' : '对比图片'}
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            <div className="pointer-events-none absolute bottom-2 left-2 rounded border border-white/10 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
              {tapShowFirst || !hasSecond ? '原始' : '生成'} · 点击切换
            </div>
          </div>
        ) : (
          <>
            <img
              src={proxyMediaUrl(firstImage)}
              alt="原始图片"
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
            {secondImage && (
              <div
                className="absolute inset-0 w-full h-full overflow-hidden"
                style={
                  mode === 'overlay'
                    ? { opacity: split / 100 }
                    : { clipPath: `inset(0 0 0 ${split}%)` }
                }
              >
                <img
                  src={proxyMediaUrl(secondImage)}
                  alt="对比图片"
                  className="w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
              </div>
            )}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.55)]"
              style={{ left: `${split}%` }}
            >
              <div className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/85 bg-black/40 shadow-xl backdrop-blur-sm">
                <div className="flex items-center gap-1 text-xs font-semibold text-white">
                  <span>&lt;</span>
                  <span>&gt;</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              role="slider"
              aria-label={
                isFullscreen
                  ? '全屏对比分割位置'
                  : mode === 'overlay'
                    ? '叠加不透明度'
                    : '对比分割位置'
              }
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(split)}
              onKeyDown={handleSliderKeyDown}
              onMouseDown={(e) => startDrag(e, viewportRef.current)}
              onClick={(e) => e.stopPropagation()}
              className="nodrag absolute top-0 bottom-0 z-20 w-8 -translate-x-1/2 cursor-ew-resize bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              style={{ left: `${split}%` }}
            />
            <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-medium px-2 py-0.5 rounded backdrop-blur-sm border border-white/10 pointer-events-none">
              原始
            </div>
            <div
              className={`absolute bottom-2 right-2 text-white text-[10px] font-medium px-2 py-0.5 rounded backdrop-blur-sm border border-white/10 pointer-events-none ${
                hasSecond ? 'bg-blue-600/80' : 'bg-amber-600/80'
              }`}
            >
              {mode === 'overlay' ? `${Math.round(split)}%` : hasSecond ? '生成' : '需要第 2 路'}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      className="relative w-full h-full select-none"
      style={{ height: `${node.height || 240}px` }}
    >
      {toolbar}
      {renderViewport(containerRef, false)}
      {fullscreenOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="图片对比全屏预览"
            className="fixed inset-0 z-[9999] flex flex-col bg-black/90 p-6 backdrop-blur-md"
            onClick={() => setFullscreenOpen(false)}
          >
            <div
              className="mx-auto mb-4 flex items-center gap-2 rounded-full border border-zinc-800 bg-[#1a1a1a]/95 px-3 py-1.5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {COMPARE_MODE_ITEMS.map(({ mode: itemMode, label }) => (
                <button
                  key={itemMode}
                  type="button"
                  onClick={() => setMode(itemMode)}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                    mode === itemMode ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
              {hasSecond && (
                <button
                  type="button"
                  onClick={() => setSwapped((v) => !v)}
                  className="rounded-full px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                >
                  交换左右
                </button>
              )}
              <button
                type="button"
                aria-label="关闭全屏对比"
                onClick={() => setFullscreenOpen(false)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
            <div
              className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {renderViewport(fullscreenRef, true)}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export const CanvasMonitorNode: React.FC<SimpleNodeProps> = ({ node, nodes, projectId }) => {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const linkedNodes = (node.referenceNodeIds || [])
    .map((id) => nodes.find((n) => n.id === id))
    .filter((source): source is CanvasNode => Boolean(source));
  const linkedNode = linkedNodes.find(source => !source.missingMedia && Boolean(source.videoUrl || source.imageUrl));
  const emptyMessage = !linkedNodes.length ? '连接任一生成或视频节点以接入信号源'
    : linkedNodes.some(source => source.status === 'generating') ? '上游正在生成，完成后会自动显示'
    : linkedNodes.some(source => source.status === 'error' || source.missingMedia) ? '上游素材不可用，请检查上游节点'
    : '已连接上游，等待生成结果或素材';

  const mediaUrl = linkedNode?.videoUrl || linkedNode?.imageUrl || node.videoUrl || node.imageUrl;
  const videoSource = linkedNode?.videoUrl || (!linkedNode ? node.videoUrl : undefined);
  const isVideo = Boolean(videoSource && mediaUrl === videoSource);
  const fitMode = node.previewFit || 'contain';

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      void videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const toggleFit = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateNode(projectId, node.id, { previewFit: fitMode === 'contain' ? 'cover' : 'contain' });
  };

  return (
    <div
      className="relative flex flex-col w-full h-full rounded-2xl bg-black border-2 border-slate-800 shadow-2xl overflow-hidden select-none group/monitor"
      style={{ minHeight: `${node.height || 360}px` }}
    >
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-white/10 text-xs z-10">
        <div className="flex items-center gap-2 text-slate-300">
          <Tv className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="font-mono text-[11px] tracking-wide text-cyan-400">MONITOR // {node.title || '导演监视器'}</span>
        </div>
        <button
          type="button"
          onClick={toggleFit}
          title={fitMode === 'contain' ? '画面铺满' : '画面完整包含'}
          className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <Scan className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-zinc-950 overflow-hidden">
        {!mediaUrl ? (
          <div className="flex flex-col items-center justify-center text-zinc-600 text-xs p-6 text-center">
            <Tv className="w-8 h-8 mb-2 opacity-40 text-cyan-500" />
            <p className="font-mono text-zinc-400">NO SIGNAL</p>
            <p className="text-[11px] text-zinc-500 mt-1">{emptyMessage}</p>
          </div>
        ) : isVideo ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={proxyMediaUrl(mediaUrl)}
              loop
              playsInline
              className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md opacity-0 group-hover/monitor:opacity-100 transition-opacity z-20">
              <button
                type="button"
                onClick={togglePlay}
                className="flex items-center gap-2 text-white text-xs font-semibold hover:text-cyan-400 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? '暂停' : '播放'}</span>
              </button>
              <span className="font-mono text-[10px] text-cyan-400 uppercase">{linkedNode?.title || '主控视频源'}</span>
            </div>
          </div>
        ) : (
          <img src={proxyMediaUrl(mediaUrl)} alt="Monitor" className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`} />
        )}
      </div>
    </div>
  );
};

export const CanvasSaveNode: React.FC<SimpleNodeProps> = ({ node, nodes }) => {
  const [downloading, setDownloading] = useState(false);
  const [success, setSuccess] = useState(false);

  const linkedNodes = (node.referenceNodeIds || [])
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean) as CanvasNode[];

  const mediaItems = linkedNodes
    .map((n) => ({
      id: n.id,
      title: n.title || '导出素材',
      type: n.type === 'video' || n.generationKind === 'video' ? 'video' : 'image',
      url: (n.type === 'video' || n.generationKind === 'video' ? n.videoUrl : n.imageUrl) || '',
    }))
    .filter((item) => Boolean(item.url));

  const handleExportAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!mediaItems.length || downloading) return;
    try {
      setDownloading(true);
      setSuccess(false);
      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        const ext = item.type === 'video' ? 'mp4' : 'png';
        await downloadMediaOrOpen(item.url, `${node.savePrefix || '短剧产出'}_${i + 1}_${item.title}.${ext}`);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '导出失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="relative flex flex-col w-full h-full rounded-2xl bg-white dark:bg-[#1B1B1E] border border-slate-200/90 dark:border-white/10 shadow-lg p-4 select-none"
      style={{ minHeight: `${node.height || 260}px` }}
    >
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-2">
          <FolderArchive className="w-4 h-4 text-emerald-500" />
          <span className="font-semibold text-xs text-slate-800 dark:text-slate-100">{node.title || '本地批量导出'}</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
          已连入 {mediaItems.length} 项
        </span>
      </div>
      <div className="flex-1 py-3 overflow-y-auto max-h-[160px] space-y-1.5">
        {mediaItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs py-6 text-center">
            <FileText className="w-6 h-6 mb-1 opacity-40" />
            <p className="text-[11px]">暂无连入素材</p>
            <p className="text-[10px] text-slate-500 mt-0.5 dark:text-slate-400">将上游画面连入左侧端点自动归档</p>
          </div>
        ) : (
          mediaItems.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-2.5 p-1.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 text-xs">
              <div className="w-9 h-9 rounded-lg overflow-hidden bg-black/20 shrink-0">
                {item.type === 'video' ? (
                  <video src={proxyMediaUrl(item.url)} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={proxyMediaUrl(item.url)} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-slate-700 dark:text-slate-200 text-[11px]">{item.title}</p>
                <p className="text-[10px] text-slate-400">镜头 #{idx + 1} · {item.type.toUpperCase()}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="pt-2 border-t border-slate-100 dark:border-white/5">
        <button
          type="button"
          disabled={mediaItems.length === 0 || downloading}
          onClick={handleExportAll}
          className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {downloading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>正在导出下载...</span>
            </>
          ) : success ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
              <span>导出完成</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>一键导出全部素材 ({mediaItems.length})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

type Props = { node: CanvasNode; nodes: CanvasNode[]; projectId: string; selected?: boolean; updateNode: (projectId: string, nodeId: string, patch: Partial<CanvasNode>) => void };
const action = 'rounded-md border border-black/10 px-2.5 py-1.5 text-xs hover:bg-black/5 disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/10';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，请检查上游素材'));
    image.src = proxyMediaUrl(url);
  });
}

export function CanvasLocalToolNode(props: Props) {
  const { node, nodes, projectId, updateNode } = props;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const table = node.studioSubType === 'table-editor-node';
  const tile = node.studioSubType === 'image-tile';
  const sequence = node.studioSubType === 'shot-breakdown';
  const refs = (node.referenceNodeIds ?? []).map(id => nodes.find(candidate => candidate.id === id)).filter(Boolean) as CanvasNode[];
  const video = node.videoUrl || refs.find(ref => ref?.videoUrl)?.videoUrl;
  const images = refs.flatMap(ref => ref?.imageUrl && !ref.missingMedia ? [ref.imageUrl] : []).slice(0, 16);
  const Icon = tile ? Grid2X2 : Film;

  if (table) return <CanvasTableEditorNode {...props} />;

  const run = async () => {
    if (busyRef.current || node.layerLocked) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (tile) {
        const loaded = await Promise.all(images.map(loadImage));
        const columns = Math.min(loaded.length, Math.max(1, Math.min(4, Math.round(Number(value) || 2))));
        const canvas = document.createElement('canvas');
        canvas.width = columns * 384;
        canvas.height = Math.ceil(loaded.length / columns) * 384;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法创建拼图画布');
        loaded.forEach((image, index) => {
          const scale = 384 / Math.max(image.naturalWidth, image.naturalHeight);
          const width = image.naturalWidth * scale;
          const height = image.naturalHeight * scale;
          context.drawImage(image, (index % columns) * 384 + (384 - width) / 2, Math.floor(index / columns) * 384 + (384 - height) / 2, width, height);
        });
        updateNode(projectId, node.id, { imageUrl: canvas.toDataURL('image/png') });
      } else if (video) {
        const first = await extractVideoFrame(video, sequence ? 0 : Math.max(0, Number(value) || 0));
        if (!sequence) {
          updateNode(projectId, node.id, { imageUrl: first.dataUrl });
        } else {
          const count = Math.min(12, Math.max(2, Math.round(Number(value) || 6)));
          const frames = [first];
          for (let index = 1; index < count; index += 1) {
            frames.push(await extractVideoFrame(video, first.duration * index / count));
          }
          const state = useCanvasStore.getState();
          const current = state.projects.find(project => project.id === projectId)?.nodes.find(candidate => candidate.id === node.id);
          if (!current || current.layerLocked) return;
          frames.forEach((frame, index) => state.addNode(projectId, {
            id: crypto.randomUUID(), type: 'image', imageUrl: frame.dataUrl,
            title: `画面 · ${(first.duration * index / count).toFixed(2)} 秒`,
            width: 200, height: Math.round(200 * frame.height / frame.width),
            x: current.x + current.width + 72 + (index % 3) * 248,
            y: current.y + Math.floor(index / 3) * (Math.round(200 * first.height / first.width) + 52),
          }));
          updateNode(projectId, node.id, { content: `已输出 ${count} 张画面` });
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '处理失败');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return <section aria-label={node.title} style={{ height: node.height }} className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-3 text-slate-800 dark:border-white/10 dark:bg-[#202022] dark:text-zinc-200">
    <header className="flex items-center gap-2 text-xs font-medium"><Icon size={15} className="text-[#d2987a]" />{node.title}</header>
    <p className="text-xs opacity-65">{tile ? `已连接 ${images.length} 张图片，最多使用 16 张` : video ? '已连接视频素材' : '从视频节点拉线至此'}</p>
    <div className="flex items-center gap-2">
      <label className="text-xs">{tile ? '列数' : sequence ? '帧数' : '时间（秒）'}
        <input type="number" min={sequence ? 2 : tile ? 1 : 0} max={tile ? 4 : sequence ? 12 : undefined} step={tile || sequence ? 1 : 0.1} placeholder={tile ? '2' : sequence ? '6' : '0'} disabled={busy || node.layerLocked} value={value} onChange={event => setValue(event.target.value)} className="ml-2 w-16 rounded border border-black/10 bg-transparent p-1 dark:border-white/15" />
      </label>
      <button type="button" className={action} disabled={busy || node.layerLocked || (tile ? images.length === 0 : !video)} onClick={() => void run()}>{busy ? '处理中…' : tile ? '生成拼图' : sequence ? '输出画面' : '抽取画面'}</button>
    </div>
    {node.imageUrl && <img alt="图像输出" className="min-h-0 flex-1 rounded-lg object-contain" src={proxyMediaUrl(node.imageUrl)} />}
    {sequence && node.content && <p role="status" className="text-xs">{node.content}</p>}
    {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
  </section>;
}
