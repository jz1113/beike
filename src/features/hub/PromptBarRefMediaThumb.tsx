'use client';
import { isVideoMediaUrl } from '@/lib/mediaHelper';
import { proxyMediaUrl } from '@/lib/apiClient';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';

/** 参考素材缩略图：图片用 img，视频用 video（避免 mp4 塞进 img 变成空白「素材没了」） */
export function RefMediaThumb({
  url,
  alt,
  className,
}: {
  url: string;
  alt?: string;
  className?: string;
}) {
  if (isVideoMediaUrl(url)) {
    return (
      <video
        src={url}
        muted
        playsInline
        autoPlay
        loop
        preload="auto"
        onLoadedData={(e) => {
          const v = e.currentTarget;
          // 若自动播放被拦，至少 seek 出一帧避免白底
          if (v.paused) {
            try { v.currentTime = 0.08; } catch {}
            v.play().catch(() => {});
          }
        }}
        className={className}
        aria-label={alt || '参考视频'}
      />
    );
  }
  return (
    <img
      src={normalizeImageUrlToStandardJpg(url)}
      alt={alt || '参考素材'}
      referrerPolicy="no-referrer"
      onError={(e) => {
        const target = e.currentTarget;
        if (!target.dataset.hasRetried && url) {
          target.dataset.hasRetried = 'true';
          target.src = proxyMediaUrl(url);
        }
      }}
      className={className}
    />
  );
}


