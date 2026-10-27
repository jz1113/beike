import { groupCardImageUrl } from '../../model/groupPreviewImageSources';
import { Image as ImageIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function PreviewTile({ url, index }: { url: string; index: number }) {
  const [useDirectUrl, setUseDirectUrl] = useState(false);
  const [failed, setFailed] = useState(false);
  const directUrl = url.startsWith('//') ? `https:${url}` : url;
  const proxyUrl = groupCardImageUrl(directUrl);

  if (failed) {
    return <div className="flex min-h-0 min-w-0 items-center justify-center bg-slate-100 text-slate-300 dark:bg-white/10"><ImageIcon className="h-5 w-5" /></div>;
  }

  return (
    <img
      src={useDirectUrl ? directUrl : proxyUrl}
      alt={`图组第 ${index + 1} 镜`}
      className="h-full w-full min-h-0 min-w-0 object-cover transition-transform duration-300 group-hover/thumb:scale-[1.02]"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!useDirectUrl && proxyUrl !== directUrl) setUseDirectUrl(true);
        else setFailed(true);
      }}
    />
  );
}

export function FullPromptCardMosaic({
  sourceImages,
  sourceImageIndices,
  coverUrl,
  title,
  onCoverError,
}: {
  sourceImages: unknown;
  sourceImageIndices: unknown;
  coverUrl: string;
  title: string;
  onCoverError: () => void;
}) {
  const images = useMemo(() => {
    const all = parseArray(sourceImages).map((value) => typeof value === 'string' ? value.trim() : '');
    const indices = parseArray(sourceImageIndices);
    const selected = indices.length > 0
      ? indices.slice(0, 4).map((index) => Number.isInteger(index) && Number(index) > 0 ? all[Number(index) - 1] : '')
      : all.slice(0, 4);
    return selected.length === 4 && selected.every(Boolean) ? selected : [];
  }, [sourceImages, sourceImageIndices]);

  if (images.length !== 4) {
    return <img src={coverUrl} alt={title} className="h-full w-full object-cover" loading="eager" decoding="async" onError={onCoverError} />;
  }

  return (
    <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden bg-slate-200/80 dark:bg-black/60">
      {images.map((url, index) => <PreviewTile key={`${index}:${url}`} url={url} index={index} />)}
    </div>
  );
}
