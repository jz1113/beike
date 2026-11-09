import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

function imageIdentity(source: string, base: string): string {
  try {
    const url = new URL(source, base);
    if (url.pathname === '/api/system/proxy-image') {
      const original = url.searchParams.get('url');
      if (original) return new URL(original, base).href;
    }
    return url.href;
  } catch {
    return source;
  }
}

/** Reuse decoded images, including an earlier proxy signature or direct fallback. */
export function findLoadedImagePreview(source: string) {
  if (typeof document === 'undefined' || !document.images) return null;
  const identity = imageIdentity(source, document.baseURI);
  const loaded = Array.from(document.images)
    .filter((image) => image.complete && image.naturalWidth > 0 &&
      imageIdentity(image.currentSrc || image.src, document.baseURI) === identity)
    .sort((a, b) => b.naturalWidth - a.naturalWidth)[0];
  if (!loaded) return null;

  const src = loaded.currentSrc || loaded.src;
  const url = new URL(src, document.baseURI);
  const isThumbnail = url.pathname === '/api/system/proxy-image' &&
    (url.searchParams.has('thumb') || url.searchParams.has('w'));
  return { src, width: loaded.naturalWidth, height: loaded.naturalHeight, isThumbnail };
}

/** Reuse the actual decoded feed image, including its direct/proxy fallback URL. */
export function resolveLightboxImageSources(resultUrl: string) {
  const fullSource = proxyMediaUrl(resultUrl, { width: 1920 });
  const fallbackSources = [...new Set([fullSource, resultUrl])];
  const loaded = findLoadedImagePreview(proxyMediaUrl(resultUrl));
  if (!loaded) return { sources: fallbackSources, preview: null };

  const { src, isThumbnail, width, height } = loaded;
  return {
    // Direct originals are already in the browser cache; avoid fetching them again via the server.
    sources: isThumbnail ? fallbackSources : [src, ...fallbackSources.filter((source) => source !== src)],
    preview: { src, width, height },
  };
}

/** Mounted with a URL key so task metadata updates cannot hide an already loaded image. */
export function LightboxImage({ resultUrl, alt }: { resultUrl: string; alt: string }) {
  const [{ sources, preview }] = useState(() => resolveLightboxImageSources(resultUrl));
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const imageClass = 'col-start-1 row-start-1 max-h-[100cqh] max-w-full object-contain select-none';

  return (
    <div className={`relative max-h-full max-w-full inline-grid place-items-center rounded-2xl overflow-hidden shadow-2xl ${preview || loaded ? '' : 'min-h-48 min-w-48'}`}>
      {preview && !loaded && (
        <img src={preview.src} width={preview.width} height={preview.height} alt="" aria-hidden="true" className={imageClass} decoding="async" referrerPolicy="no-referrer" />
      )}
      <img
        key={`${sources[sourceIndex]}:${attempt}`}
        src={sources[sourceIndex]}
        alt={alt}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        referrerPolicy="no-referrer"
        ref={(image) => {
          if (image?.complete && image.naturalWidth > 0) setLoaded(true);
        }}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (sourceIndex + 1 < sources.length) setSourceIndex(sourceIndex + 1);
          else setFailed(true);
        }}
        className={`${imageClass} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200`}
      />
      <div className="absolute top-3 left-3 z-30 px-2 py-0.5 rounded bg-black/45 backdrop-blur-xs text-[10px] text-white/90 font-medium select-none pointer-events-none tracking-tight shadow-2xs">
        AI生成
      </div>
      {!loaded && !failed && (
        <div role="status" aria-label="正在加载高清图片" className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
        </div>
      )}
      {failed && !loaded && (
        <div role="status" className="absolute bottom-3 inset-x-0 text-center text-xs text-white/80">
          {preview ? '高清图片加载失败，当前显示预览图' : '图片加载失败'}
          <button type="button" className="ml-2 underline cursor-pointer" onClick={() => {
            setFailed(false);
            setSourceIndex(0);
            setAttempt((value) => value + 1);
          }}>重试</button>
        </div>
      )}
    </div>
  );
}
