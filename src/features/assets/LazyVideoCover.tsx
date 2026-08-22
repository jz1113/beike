'use client';
import { useState, useRef, useEffect } from 'react';
import { Play } from 'lucide-react';

// 🌟 高性能视频懒加载封面组件 (默认轻量海报，悬停 >120ms 才挂载真实视频解码器，彻底释放 GPU)
export default function LazyVideoCover({ src }: { src: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    hoverTimerRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setIsHovered(false);
  };

  return (
    <div 
      className="w-full h-full relative group/vid bg-black flex items-center justify-center overflow-hidden"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isHovered ? (
        <video 
          src={src} 
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover bg-black"
        />
      ) : (
        <div className="w-full h-full relative bg-slate-900 flex items-center justify-center">
          <video 
            src={`${src}#t=0.001`} 
            preload="metadata"
            muted
            className="w-full h-full object-cover pointer-events-none opacity-85"
          />
        </div>
      )}
      {!isHovered && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-xs text-white flex items-center justify-center shadow-lg border border-white/20">
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );
}
