import { useState, useRef, useEffect, useId } from 'react';
import { VideoOff } from 'lucide-react';
import { videoPlaybackManager } from '@client/shared/media/videoPlaybackManager';

interface Props {
  src: string;
  fallbackSrc?: string;
  className?: string;
  objectFit?: 'cover' | 'contain';
  autoPlay?: boolean;
}

function VideoCover({ src, fallbackSrc, className, objectFit = 'cover', autoPlay = true }: Props) {
  const sources = Array.from(new Set([src, fallbackSrc].filter((source): source is string => Boolean(source))));
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const activeSource = sources[attempt] || '';
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackAllowed = useRef(false);
  const hovered = useRef(false);
  const uniqueId = useId();

  // Offscreen cards do not request metadata until they approach the viewport.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof IntersectionObserver === 'undefined') {
      setReady(true);
      return;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setReady(true);
        observer.disconnect();
      }
    }, { rootMargin: '200px' });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video || !ready || !autoPlay || failed) return;
    let current = true;
    const unregister = videoPlaybackManager.register(uniqueId, container, shouldPlay => {
      playbackAllowed.current = shouldPlay;
      if (shouldPlay) {
        void videoPlaybackManager.safePlay(video).then(() => {
          if (!current || !playbackAllowed.current) videoPlaybackManager.safePause(video);
        });
      } else {
        videoPlaybackManager.safePause(video);
      }
    });
    if (hovered.current) videoPlaybackManager.setHovered(uniqueId, true);
    return () => {
      current = false;
      playbackAllowed.current = false;
      unregister();
      videoPlaybackManager.safePause(video);
    };
  }, [uniqueId, activeSource, ready, autoPlay, failed]);

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-black select-none ${className || ''}`}
      onMouseEnter={() => { hovered.current = true; if (autoPlay) videoPlaybackManager.setHovered(uniqueId, true); }}
      onMouseLeave={() => { hovered.current = false; videoPlaybackManager.setHovered(uniqueId, false); }}
    >
      <video
        key={activeSource}
        ref={videoRef}
        src={ready ? activeSource : undefined}
        loop
        muted
        playsInline
        preload={ready ? 'metadata' : 'none'}
        onLoadedData={() => { setHasLoaded(true); setFailed(false); }}
        onPlaying={event => {
          if (!playbackAllowed.current || document.hidden) videoPlaybackManager.safePause(event.currentTarget);
        }}
        onError={() => {
          setHasLoaded(false);
          if (attempt < sources.length - 1) setAttempt(attempt + 1);
          else setFailed(true);
        }}
        className={`h-full w-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'} transition-opacity duration-300 ${hasLoaded && !failed ? 'opacity-100' : 'opacity-0'}`}
      />
      {!hasLoaded && !failed && <div className="pointer-events-none absolute inset-0 animate-pulse bg-slate-900" />}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 p-3 text-slate-500" role="status">
          <VideoOff className="h-6 w-6" aria-hidden="true" />
          <span className="text-xs">视频暂时无法加载</span>
        </div>
      )}
    </div>
  );
}

export default function LazyVideoCover(props: Props) {
  // Reset the full load/playback lifecycle, including a return to a previously failed URL.
  return <VideoCover key={JSON.stringify([props.src, props.fallbackSrc])} {...props} />;
}
