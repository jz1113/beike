import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Film, Play, Pause, MapPin, Sparkles, Clock,
  ArrowLeft, RefreshCw,
} from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { CanvasNode, CanvasProject } from '../../model/types';

interface Props {
  project: CanvasProject;
  onBackToCanvas: (focusNodeId?: string) => void;
  onRegenerateNode?: (node: CanvasNode) => void;
}

export const CanvasStoryboardView: React.FC<Props> = ({
  project,
  onBackToCanvas,
  onRegenerateNode,
}) => {
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const activeVideoRef = useRef<HTMLVideoElement>(null);

  // Filter media / shot nodes
  const shotNodes = useMemo(() => {
    return project.nodes
      .filter((n) => !n.layerHidden && Boolean(n.imageUrl || n.videoUrl))
      .sort((a, b) => a.x - b.x);
  }, [project.nodes]);

  const totalDuration = useMemo(() => {
    return shotNodes.reduce((sum, node) => {
      const dur = node.drawing?.duration || (node.type === 'video' ? 5 : 3);
      return sum + dur;
    }, 0);
  }, [shotNodes]);

  const handlePlayNext = () => {
    if (currentShotIndex < shotNodes.length - 1) {
      setCurrentShotIndex((idx) => idx + 1);
    } else {
      setIsPlayingAll(false);
      setCurrentShotIndex(0);
    }
  };

  useEffect(() => {
    if (!isPlayingAll) return;
    const node = shotNodes[currentShotIndex];
    if (!node || node.videoUrl) return;
    const durationMs = Math.max(1, node.drawing?.duration || 3) * 1000;
    const timer = window.setTimeout(() => {
      setCurrentShotIndex((idx) => {
        if (idx < shotNodes.length - 1) return idx + 1;
        setIsPlayingAll(false);
        return 0;
      });
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [isPlayingAll, currentShotIndex, shotNodes]);

  const handleTogglePlayAll = () => {
    if (isPlayingAll) {
      setIsPlayingAll(false);
    } else {
      setIsPlayingAll(true);
      setCurrentShotIndex(0);
    }
  };

  return (
    <div className="flex-1 w-full h-full flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* 故事板顶栏 */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900/90 border-b border-white/10 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onBackToCanvas()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-200 transition-colors cursor-pointer dark:bg-[#18191c]/95"
          >
            <ArrowLeft size={14} />
            <span>返回无限画布</span>
          </button>
          <div className="h-4 w-px bg-white/10 dark:bg-[#18191c]/95" />
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-purple-400" />
            <span className="font-bold text-sm text-white tracking-wide">
              {project.title || '短剧创作'} · 故事板总览
            </span>
          </div>
        </div>

        {/* 短剧时间与顺播控制 */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <Clock size={14} className="text-purple-400" />
            <span>共 {shotNodes.length} 个镜头 · 预估时长 {totalDuration}s</span>
          </div>

          <button
            type="button"
            onClick={handleTogglePlayAll}
            disabled={shotNodes.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg active:scale-95 ${
              isPlayingAll
                ? 'bg-purple-600 text-white ring-4 ring-purple-500/20'
                : 'bg-white text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10 dark:bg-[#18191c]'
            }`}
          >
            {isPlayingAll ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlayingAll ? '暂停预览' : '一键连贯顺播'}</span>
          </button>
        </div>
      </div>

      {/* 故事板横向走廊网格 */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-6 items-stretch">
        {shotNodes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm dark:text-slate-400">
            <Film size={36} className="mb-3 opacity-30 text-purple-400" />
            <p className="font-semibold text-slate-300">画布暂无生成镜头</p>
            <p className="text-xs text-slate-500 mt-1 dark:text-slate-400">在画布中添加图片或视频生成节点后，故事板将自动同步编排分镜</p>
            <button
              type="button"
              onClick={() => onBackToCanvas()}
              className="mt-4 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-500 cursor-pointer"
            >
              去画布创作
            </button>
          </div>
        ) : (
          shotNodes.map((node, index) => {
            const isVideo = node.type === 'video' || node.generationKind === 'video';
            const mediaUrl = node.videoUrl || node.imageUrl;
            const isCurrentPlaying = isPlayingAll && currentShotIndex === index;
            const duration = node.drawing?.duration || (isVideo ? 5 : 3);

            return (
              <div
                key={node.id}
                className={`relative flex flex-col w-[320px] rounded-2xl bg-slate-900/90 border transition-all shrink-0 overflow-hidden group shadow-xl ${
                  isCurrentPlaying
                    ? 'border-purple-500 ring-4 ring-purple-500/30'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* 卡片顶标 */}
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-white/5 border-b border-white/5 text-xs dark:bg-[#18191c]/95">
                  <span className="font-mono font-bold text-purple-400">SHOT #{index + 1}</span>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Clock size={12} />
                    <span>{duration}s</span>
                  </div>
                </div>

                {/* 媒体画面区 */}
                <div className="relative w-full h-[200px] bg-black flex items-center justify-center overflow-hidden">
                  {!mediaUrl ? (
                    <div className="flex flex-col items-center justify-center text-slate-600 text-xs dark:text-slate-300">
                      <Sparkles size={20} className="mb-1 text-purple-400 opacity-60" />
                      <span>待生成画面</span>
                    </div>
                  ) : isVideo ? (
                    <video
                      ref={isCurrentPlaying ? activeVideoRef : undefined}
                      src={proxyMediaUrl(mediaUrl)}
                      className="w-full h-full object-cover"
                      autoPlay={isCurrentPlaying}
                      playsInline
                      muted={!isCurrentPlaying}
                      onEnded={handlePlayNext}
                    />
                  ) : (
                    <img src={proxyMediaUrl(mediaUrl)} alt="" className="w-full h-full object-cover" />
                  )}

                  {/* 悬停定位按钮 */}
                  <button
                    type="button"
                    title="在无限画布中定位此镜头"
                    onClick={() => onBackToCanvas(node.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-xl bg-black/60 backdrop-blur-md text-white hover:bg-purple-600 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  >
                    <MapPin size={14} />
                  </button>
                </div>

                {/* 镜头剧本文案区 */}
                <div className="flex-1 p-3.5 flex flex-col justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-slate-200 truncate">{node.title || `镜头 ${index + 1}`}</p>
                    <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                      {node.content || node.textPrompt || '暂无描述文案，可点击在画布补充提示词'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px]">
                    <span className="text-slate-500 uppercase font-mono dark:text-slate-400">{isVideo ? 'VIDEO' : 'IMAGE'}</span>
                    <button
                      type="button"
                      onClick={() => onRegenerateNode?.(node)}
                      className="flex items-center gap-1 text-purple-400 hover:text-purple-300 font-semibold cursor-pointer"
                    >
                      <RefreshCw size={12} />
                      <span>重绘</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
