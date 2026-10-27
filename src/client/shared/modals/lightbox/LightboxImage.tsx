import { useEffect, useState } from 'react';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';

export function LightboxImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(src.startsWith('blob:') || src.startsWith('data:') ? src : null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (src.startsWith('blob:') || src.startsWith('data:')) return;
    let cancelled = false;
    let ownedUrl: string | undefined;
    // This also detects HTTP-200 proxy placeholders, which never trigger an
    // img error event, and falls back to the original media when available.
    void fetchMediaBlob(src).then((blob) => {
      if (cancelled) return;
      ownedUrl = URL.createObjectURL(blob);
      setImageUrl(ownedUrl);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [src]);
  if (failed) return <div className="flex h-full min-h-20 min-w-20 items-center justify-center rounded-2xl bg-white/10 px-4 text-xs text-white/60">图片加载失败</div>;
  if (!imageUrl) return <div role="status" className="text-xs text-white/60">正在加载图片…</div>;
  return <img
    src={imageUrl}
    alt={alt}
    className={className}
    referrerPolicy="no-referrer"
    onError={() => setFailed(true)}
  />;
}

