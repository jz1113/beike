import { useRef } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { displayMediaSrc, displayVideoSrc, handleImgError, isLikelyVideoUrl } from '../utils/collectorTypes';

interface Props {
  url: string;
  videoUrls: Array<string | null | undefined>;
  onClose: () => void;
}

export default function CollectorMediaPreview({ url, videoUrls, onClose }: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  useFocusTrap(previewRef, true, onClose);
  const isVideo = isLikelyVideoUrl(url) || videoUrls.includes(url);

  return (
    <div
      ref={previewRef}
      role="dialog"
      aria-modal="true"
      aria-label="素材全屏预览"
      tabIndex={-1}
      onClick={onClose}
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in cursor-zoom-out"
    >
      <button
        type="button"
        aria-label="关闭全屏预览"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white cursor-pointer"
      >
        <X className="h-6 w-6" />
      </button>
      {isVideo ? (
        <video
          src={displayVideoSrc(url)}
          controls
          autoPlay
          playsInline
          className="max-w-[90vw] max-h-[90dvh] rounded-2xl shadow-2xl border border-white/20 bg-black"
          onClick={event => event.stopPropagation()}
        />
      ) : (
        <img
          src={displayMediaSrc(url) || url}
          alt="高清大图预览"
          referrerPolicy="no-referrer"
          onError={event => handleImgError(event, url)}
          className="max-w-[90vw] max-h-[90dvh] object-contain rounded-2xl shadow-2xl border border-white/20"
        />
      )}
    </div>
  );
}
