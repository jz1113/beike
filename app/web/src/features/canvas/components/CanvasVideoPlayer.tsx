import React, { useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

// 🌟 居中半透明圆形播放按钮与悬浮暂停交互的视频播放器微组件
export const CanvasVideoPlayer: React.FC<{
  videoUrl: string;
  poster?: string;
  height?: number;
  onLoadedMetadata?: (info: { videoWidth: number; videoHeight: number; duration: number }) => void;
}> = ({ videoUrl, poster, height, onLoadedMetadata }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string | undefined>();

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div
      onClick={handleTogglePlay}
      style={{
        ...(height ? { height } : undefined),
        ...(aspectRatio ? { aspectRatio } : undefined),
      }}
      className={`relative w-full ${height || aspectRatio ? '' : 'aspect-[9/16] max-h-[520px]'} bg-slate-950 rounded-xl overflow-hidden shadow-xs group/video flex items-center justify-center cursor-pointer select-none`}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={poster}
        playsInline
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          const videoWidth = video.videoWidth;
          const videoHeight = video.videoHeight;
          if (videoWidth && videoHeight) setAspectRatio(`${videoWidth} / ${videoHeight}`);
          onLoadedMetadata?.({
            videoWidth,
            videoHeight,
            duration: video.duration,
          });
        }}
        className="w-full h-full object-contain select-none pointer-events-none"
      />
      {/* 居中半透明磨砂圆形控制按钮：未播放时常驻 Play；播放中 hover 展现 Pause */}
      <button
        type="button"
        onClick={handleTogglePlay}
        className={`absolute inset-0 m-auto w-12 h-12 rounded-full bg-black/45 hover:bg-black/60 backdrop-blur-xs text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 shadow-lg cursor-pointer z-10 ${
          !isPlaying
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 group-hover/video:opacity-100 scale-95 group-hover/video:scale-100 pointer-events-auto'
        }`}
        title={isPlaying ? '暂停视频' : '播放视频'}
      >
        {!isPlaying ? (
          <Play className="w-5 h-5 fill-white text-white ml-0.5" />
        ) : (
          <Pause className="w-5 h-5 fill-white text-white" />
        )}
      </button>
    </div>
  );
};
