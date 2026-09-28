import { useState, useRef, useEffect, useId } from 'react';
import { videoPlaybackManager } from '@client/shared/media/videoPlaybackManager';

export default function LazyVideoCover({
  src,
  className,
  objectFit = 'cover',
}: {
  src: string;
  className?: string;
  objectFit?: 'cover' | 'contain';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const uniqueId = useId();

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;
    const unregister = videoPlaybackManager.register(uniqueId, container, (shouldPlay) => {
      if (shouldPlay) {
        void videoPlaybackManager.safePlay(video).then((ok) => {
          if (ok) setIsPlaying(true);
        });
      } else {
        videoPlaybackManager.safePause(video);
        setIsPlaying(false);
      }
    });
    return () => { unregister(); };
  }, [uniqueId, src]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative group/vid bg-black flex items-center justify-center overflow-hidden select-none ${className || ''}`}
      onMouseEnter={() => {
        if (videoRef.current) void videoPlaybackManager.safePlay(videoRef.current);
      }}
    >
      <video
        ref={videoRef}
        src={src}
        loop
        muted
        playsInline
        preload="metadata"
        onLoadedData={() => setHasLoaded(true)}
        onError={() => setFailed(true)}
        className={`w-full h-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} bg-black transition-opacity duration-300 ${hasLoaded ? 'opacity-100' : 'opacity-0'}`}
      />
      {!hasLoaded && !failed && (
        <div className="absolute inset-0 bg-slate-900 animate-pulse pointer-events-none" />
      )}
      {isPlaying ? null : null}
    </div>
  );
}
