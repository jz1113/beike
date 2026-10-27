import { useEffect, useState } from 'react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

/** Bounded retries; changing a source resets errors instead of reusing DOM retry counters. */
export function FeedImage({ src, fallbackSrc, alt = '', className, eager = false, onUnavailable }: {
  src: string; fallbackSrc?: string; alt?: string; className?: string; eager?: boolean;
  onUnavailable?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setAttempt(0); setFailed(false); }, [src]);
  useEffect(() => {
    if (!failed || attempt >= 2) return;
    const timer = setTimeout(() => { setAttempt(value => value + 1); setFailed(false); }, 800 * (attempt + 1));
    return () => clearTimeout(timer);
  }, [failed, attempt, src]);
  const source = attempt > 0 ? fallbackSrc || src : src;
  const remote = /^https?:\/\//i.test(source);
  const retrySrc = attempt === 2 && remote && !source.includes('/api/system/proxy-image') ? proxyMediaUrl(source) : source;
  return <>
    {!failed && <img key={`${src}:${attempt}`} src={retrySrc} alt={alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding="async" referrerPolicy="no-referrer" className={className}
      onError={() => { setFailed(true); if (attempt >= 2) onUnavailable?.(); }} />}
    {failed && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 text-xs text-slate-500 dark:text-slate-400 dark:bg-white/10" role="status">
      {attempt < 2 ? '素材重新加载中…' : <><span>素材暂时无法加载</span><button type="button" className="rounded-lg border bg-white px-3 py-1 dark:bg-[#18191c]" onClick={event => { event.stopPropagation(); setAttempt(0); setFailed(false); }}>重新加载</button></>}
    </div>}
  </>;
}
