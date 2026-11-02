import { memo, useMemo, useState } from 'react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

interface Props {
  url: string;
  index: number;
  alt: string;
  className?: string;
  size?: number;
  onUnavailable?: (index: number) => void;
  onDimensions?: (url: string, width: number, height: number) => void;
}

/** Small transmission copies keep the gallery light; OCR and previews retain original URLs. */
export const SalesImageThumbnail = memo(function SalesImageThumbnail({ url, index, alt, className, size = 320, onUnavailable, onDimensions }: Props) {
  const [original, setOriginal] = useState(false);
  const sources = useMemo(() => ({ thumbnail: proxyMediaUrl(url, { thumb: true, width: size }), original: proxyMediaUrl(url) }), [url, size]);
  return <img draggable={false} src={original ? sources.original : sources.thumbnail} alt={alt} loading="lazy" decoding="async" className={className} onLoad={(event) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) onDimensions?.(url, naturalWidth, naturalHeight);
  }} onError={() => {
    if (!original && sources.thumbnail !== sources.original) setOriginal(true);
    else onUnavailable?.(index);
  }} />;
});
