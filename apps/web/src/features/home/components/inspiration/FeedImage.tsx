import { useEffect, useState } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';

/** Bounded retries; changing a source resets errors instead of reusing DOM retry counters. */
export function FeedImage({ src, alt = '', className, eager = false, onAspectRatio, onUnavailable }: {
  src: string; alt?: string; className?: string; eager?: boolean;
  onAspectRatio?: (ratio: number) => void; onUnavailable?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setAttempt(0); setFailed(false); }, [src]);
  useEffect(() => {
    if (!failed || attempt >= 2) return;
    const timer = setTimeout(() => { setAttempt(value => value + 1); setFailed(false); }, 800 * (attempt + 1));
    return () => clearTimeout(timer);
  }, [failed, attempt, src]);
  const remote = /^https?:\/\//i.test(src);
  const retrySrc = attempt === 2 && remote && !src.includes('/api/system/proxy-image') ? proxyMediaUrl(src) : src;
  return <>
    {!failed && <img key={`${src}:${attempt}`} src={retrySrc} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" className={className}
      onLoad={event => { const img = event.currentTarget; if (img.naturalHeight) onAspectRatio?.(img.naturalWidth / img.naturalHeight); }}
      onError={() => { setFailed(true); if (attempt >= 2) onUnavailable?.(); }} />}
    {failed && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 text-xs text-slate-500" role="status">
      {attempt < 2 ? '素材重新加载中…' : <><span>素材暂时无法加载</span><button type="button" className="rounded-lg border bg-white px-3 py-1" onClick={event => { event.stopPropagation(); setAttempt(0); setFailed(false); }}>重新加载</button></>}
    </div>}
  </>;
}
