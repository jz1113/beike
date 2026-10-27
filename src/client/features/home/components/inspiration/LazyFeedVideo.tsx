import { useCallback, useEffect, useRef, useState } from 'react';
import { videoPlaybackManager } from '@client/shared/media/videoPlaybackManager';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';
import { FeedImage } from './FeedImage';

interface Props { src: string; poster?: string; className?: string }

/** Load posterless previews near the viewport; play only after deliberate pointer intent. */
export function LazyFeedVideo({ src, poster, className }: Props) {
  const isVisible = useViewVisibility();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackRequest = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    hovered.current = false;
    playbackRequest.current++;
    setPlaying(false);
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    const video = videoRef.current;
    if (video) {
      videoPlaybackManager.safePause(video);
      try { video.currentTime = 0; } catch { /* Metadata may not be loaded yet. */ }
    }
  }, []);

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !hovered.current || !isVisible || hasError) return;
    const request = ++playbackRequest.current;
    const ok = await videoPlaybackManager.safePlay(video);
    if (!hovered.current || videoRef.current !== video) {
      videoPlaybackManager.safePause(video);
      return;
    }
    if (request === playbackRequest.current) setPlaying(ok);
  }, [hasError, isVisible]);

  useEffect(() => {
    stop();
    setHasError(false);
    setMediaReady(false);
    setPosterFailed(false);
    if (!isVisible) return;
    const video = videoRef.current;
    const hide = () => { if (document.hidden) stop(); };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) stop();
      else if (!poster) setMediaReady(true);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    document.addEventListener('visibilitychange', hide);
    return () => {
      hovered.current = false;
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
      observer.disconnect();
      document.removeEventListener('visibilitychange', hide);
      if (video) videoPlaybackManager.safePause(video);
    };
  }, [src, poster, isVisible, stop]);

  // The first play request must run after React has attached the video source.
  useEffect(() => { if (mediaReady) void play(); }, [mediaReady, play, attempt]);

  const reveal = () => {
    hovered.current = true;
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null;
      if (mediaReady) void play();
      else setMediaReady(true);
    }, 140);
  };

  return <div ref={containerRef} className="relative w-full h-full overflow-hidden" onMouseLeave={stop} onMouseEnter={reveal}>
    <video ref={videoRef} key={`${src}:${attempt}`} src={mediaReady ? src : undefined} poster={poster} loop muted playsInline preload={mediaReady ? 'metadata' : 'none'}
      onPlaying={() => {
        if (!hovered.current || !isVisible) { if (videoRef.current) videoPlaybackManager.safePause(videoRef.current); }
        else setPlaying(true);
      }}
      onError={() => { setHasError(true); setPlaying(false); }} className={className} />
    {poster && !posterFailed && (!playing || hasError) && <FeedImage key={poster} src={poster} className={`absolute inset-0 pointer-events-none ${className || 'w-full h-full object-contain'}`} onUnavailable={() => { setPosterFailed(true); setMediaReady(true); }} />}
    {hasError && <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-xs text-white">
      <span>视频暂时无法播放</span>
      <button type="button" className="rounded-lg border border-white/30 px-3 py-1" onClick={event => {
        event.stopPropagation();
        setHasError(false);
        setMediaReady(true);
        setAttempt(value => value + 1);
      }}>重新加载</button>
    </div>}
  </div>;
}
