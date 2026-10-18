import { useEffect, useState, useRef, useId } from 'react';
import { Film } from 'lucide-react';
import { isImageFile, isVideoFile, type RefMediaKind } from '@client/shared/api/mediaUpload';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { compressImageToDataUrl } from '@client/shared/media/image-utils';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { normalizeImageUrlToStandardJpg } from '@shared/domain/media/drawing';
import { videoPlaybackManager } from '@client/shared/media/videoPlaybackManager';

export function isVideoRef(
  url: string,
  file?: File | null,
  mediaKind?: RefMediaKind | null,
): boolean {
  if (mediaKind === 'video') return true;
  if (mediaKind === 'image') return false;
  if (file) return isVideoFile(file);
  return isVideoMediaUrl(url);
}

function VideoPlaceholder({ className, alt }: { className?: string; alt?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 bg-slate-100 text-slate-400 dark:bg-white/10 ${className ?? ''}`}
      aria-label={alt || '参考视频'}
    >
      <Film className="w-6 h-6 stroke-[1.5]" />
      <span className="text-[10px] font-medium">视频</span>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (!sec || isNaN(sec) || !isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** 本地/远程视频素材预览：视口感知动态静音循环播放，真实展示动态视频 */
function VideoPreview({
  src,
  className,
  alt,
}: {
  src: string;
  className?: string;
  alt?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState<number>(0);
  const uniqueId = useId();

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video || failed) return;

    const unregister = videoPlaybackManager.register(uniqueId, container, (shouldPlay) => {
      if (shouldPlay) {
        void videoPlaybackManager.safePlay(video);
      } else {
        videoPlaybackManager.safePause(video);
      }
    });

    return () => {
      unregister();
    };
  }, [uniqueId, src, failed]);

  if (failed) {
    return <VideoPlaceholder className={className} alt={alt} />;
  }

  const durationStr = formatDuration(duration) || '00:05';

  return (
    <div
      ref={containerRef}
      className={`relative bg-slate-900 overflow-hidden group/vid ${className ?? ''}`}
      aria-label={alt || '参考视频'}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        muted
        playsInline
        loop
        autoPlay
        onLoadedMetadata={(e) => {
          if (e.currentTarget.duration) {
            setDuration(e.currentTarget.duration);
          }
        }}
        onError={() => setFailed(true)}
        className="w-full h-full object-cover pointer-events-none"
      />
      <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-xs text-white text-[9px] font-semibold pointer-events-none">
        视频
      </div>
      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-xs text-white text-[9px] font-mono font-medium pointer-events-none tabular-nums">
        {durationStr}
      </div>
    </div>
  );
}

/** 参考素材缩略图：视频用 video 标签预览，图片用 img */
export function RefMediaThumb({
  url,
  file,
  mediaKind,
  alt,
  className,
}: {
  url: string;
  file?: File | null;
  mediaKind?: RefMediaKind | null;
  alt?: string;
  className?: string;
}) {
  const isVideo = isVideoRef(url, file, mediaKind);
  const [imgSrc, setImgSrc] = useState<string>(() => normalizeImageUrlToStandardJpg(url) || url);
  const [localVideoSrc, setLocalVideoSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!isVideo) {
      setLocalVideoSrc(null);
      return;
    }
    let createdBlob: string | null = null;
    if (url.startsWith('blob:')) {
      setLocalVideoSrc(url);
    } else if (file && isVideoFile(file)) {
      createdBlob = URL.createObjectURL(file);
      setLocalVideoSrc(createdBlob);
    } else {
      setLocalVideoSrc(null);
    }
    return () => {
      if (createdBlob) URL.revokeObjectURL(createdBlob);
    };
  }, [isVideo, url, file]);

  useEffect(() => {
    if (isVideo) return;
    const normalized = normalizeImageUrlToStandardJpg(url);
    if (normalized) {
      setImgSrc(normalized);
      return;
    }
    if (file && isImageFile(file)) {
      const blob = URL.createObjectURL(file);
      setImgSrc(blob);
      return () => URL.revokeObjectURL(blob);
    }
    setImgSrc(url);
  }, [url, file, isVideo]);

  if (isVideo) {
    if (localVideoSrc) {
      return <VideoPreview src={localVideoSrc} className={className} alt={alt} />;
    }
    if (isVideoMediaUrl(url)) {
      return <VideoPreview src={url} className={className} alt={alt} />;
    }
    return <VideoPlaceholder className={className} alt={alt} />;
  }

  return (
    <img
      src={imgSrc}
      alt={alt || '参考素材'}
      referrerPolicy="no-referrer"
      onError={(e) => {
        const target = e.currentTarget;
        if (target.dataset.fallback === 'compress' && file && isImageFile(file)) return;
        if (file && isImageFile(file)) {
          target.dataset.fallback = 'compress';
          void compressImageToDataUrl(file, 1600, 0.85).then((jpeg) => {
            if (jpeg) target.src = jpeg;
          });
          return;
        }
        if (target.dataset.fallback === 'file' && file && isImageFile(file)) return;
        if (file && isImageFile(file)) {
          target.dataset.fallback = 'file';
          target.src = URL.createObjectURL(file);
          return;
        }
        if (!target.dataset.hasRetried && url) {
          target.dataset.hasRetried = 'true';
          const proxied = proxyMediaUrl(url);
          if (proxied) target.src = proxied;
        }
      }}
      className={className}
    />
  );
}
