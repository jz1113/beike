import { ImageOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { groupPreviewImageSources } from '../../model/groupPreviewImageSources';

/** Keyed by image and view; the list thumbnail stays visible until the larger image decodes. */
export function GroupPreviewImage({ url, alt, view }: { url: string; alt: string; view: 'group' | 'shot' }) {
  const [{ sources, preview, previewLoaded }] = useState(() => groupPreviewImageSources(url, view));
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [previewReady, setPreviewReady] = useState(previewLoaded);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = sources[sourceIndex];
  const showPreview = !loaded && !previewFailed && preview !== source;
  const hasPreview = showPreview && previewReady;
  const imageClass = `absolute inset-0 h-full w-full ${view === 'group' ? 'object-cover' : 'object-contain'}`;

  return <span className="relative block h-full w-full overflow-hidden" aria-busy={!loaded && !failed}>
    {showPreview && <img
      src={preview} alt="" aria-hidden="true" className={imageClass}
      decoding="async" loading="eager" fetchPriority="high" referrerPolicy="no-referrer"
      onLoad={() => setPreviewReady(true)} onError={() => { setPreviewFailed(true); setPreviewReady(false); }}
      ref={(image) => { if (image?.complete && image.naturalWidth > 0) setPreviewReady(true); }}
    />}
    <img
      key={source} src={source} alt={alt}
      loading="eager" decoding="async" fetchPriority="high" referrerPolicy="no-referrer"
      className={`${imageClass} ${loaded ? 'opacity-100' : 'opacity-0'}`}
      ref={(image) => { if (image?.complete && image.naturalWidth > 0) setLoaded(true); }}
      onLoad={() => setLoaded(true)}
      onError={() => {
        if (sourceIndex + 1 < sources.length) setSourceIndex(sourceIndex + 1);
        else setFailed(true);
      }}
    />
    {!loaded && <span role="status" className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs text-white/70 ${hasPreview ? 'items-end pb-3' : ''}`}>
      <span className="flex items-center gap-2 rounded-lg bg-slate-950/70 px-3 py-2">
        {failed ? <ImageOff className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
        {failed ? (hasPreview ? '清晰图加载失败，当前显示预览图' : '图片加载失败，请重新加载') : (hasPreview ? '正在加载清晰图…' : '正在加载画面…')}
      </span>
    </span>}
  </span>;
}
