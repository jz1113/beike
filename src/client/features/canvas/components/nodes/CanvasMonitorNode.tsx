import React, { useState, useRef } from 'react';
import { Tv, Play, Pause, Scan } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useCanvasStore } from '../../store/useCanvasStore';
import type { CanvasNode } from '../../model/types';

interface Props {
  node: CanvasNode;
  nodes: CanvasNode[];
  projectId: string;
}

export const CanvasMonitorNode: React.FC<Props> = ({ node, nodes, projectId }) => {
  const updateNode = useCanvasStore((s) => s.updateNode);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Get upstream media
  const linkedNode = (node.referenceNodeIds || [])
    .map((id) => nodes.find((n) => n.id === id))
    .find((n) => Boolean(n?.videoUrl || n?.imageUrl));

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
    updateNode(projectId, node.id, {
      previewFit: fitMode === 'contain' ? 'cover' : 'contain',
    });
  };

  return (
    <div
      className="relative flex flex-col w-full h-full rounded-2xl bg-black border-2 border-slate-800 shadow-2xl overflow-hidden select-none group/monitor"
      style={{ minHeight: `${node.height || 360}px` }}
    >
      {/* 监视屏顶栏 */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-white/10 text-xs z-10">
        <div className="flex items-center gap-2 text-slate-300">
          <Tv className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="font-mono text-[11px] tracking-wide text-cyan-400">MONITOR // {node.title || '导演监视器'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleFit}
            title={fitMode === 'contain' ? '画面铺满' : '画面完整包含'}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <Scan className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 监视视口 */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-zinc-950 overflow-hidden">
        {!mediaUrl ? (
          <div className="flex flex-col items-center justify-center text-zinc-600 text-xs p-6 text-center">
            <Tv className="w-8 h-8 mb-2 opacity-40 text-cyan-500" />
            <p className="font-mono text-zinc-400">NO SIGNAL</p>
            <p className="text-[11px] text-zinc-600 mt-1">连接任一生成或视频节点以接入信号源</p>
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
            {/* 播放控制浮层 */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-2 rounded-xl bg-black/60 backdrop-blur-md opacity-0 group-hover/monitor:opacity-100 transition-opacity z-20">
              <button
                type="button"
                onClick={togglePlay}
                className="flex items-center gap-2 text-white text-xs font-semibold hover:text-cyan-400 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{isPlaying ? '暂停' : '播放'}</span>
              </button>
              <span className="font-mono text-[10px] text-cyan-400 uppercase">
                {linkedNode?.title || '主控视频源'}
              </span>
            </div>
          </div>
        ) : (
          <img
            src={proxyMediaUrl(mediaUrl)}
            alt="Monitor"
            className={`w-full h-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
          />
        )}
      </div>
    </div>
  );
};
