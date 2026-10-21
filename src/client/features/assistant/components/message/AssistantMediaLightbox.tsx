import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useAssistantDialog } from '../../hooks/useAssistantDialog';

export interface ChatPreviewState {
  url: string;
  type: 'image' | 'video';
  poster?: string;
}

interface AssistantMediaLightboxProps {
  preview: ChatPreviewState | null;
  onClose: () => void;
  resolveAssistantMediaSrc: (rawUrl?: string | null, asVideo?: boolean) => string;
}

export default function AssistantMediaLightbox({
  preview,
  onClose,
  resolveAssistantMediaSrc,
}: AssistantMediaLightboxProps) {
  const dialogRef = useAssistantDialog(Boolean(preview), onClose);
  if (!preview) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in pointer-events-auto"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={preview.type === 'video' ? '视频预览' : '图片预览'}
        tabIndex={-1}
        className="relative max-w-4xl max-h-[90vh] w-full bg-transparent flex flex-col items-center justify-center cursor-default"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {preview.type === 'video' ? (
          <video
            key={preview.url}
            src={resolveAssistantMediaSrc(preview.url, true)}
            poster={preview.poster ? resolveAssistantMediaSrc(preview.poster, false) : undefined}
            controls
            autoPlay
            playsInline
            preload="auto"
            controlsList="nodownload"
            className="max-w-full max-h-[85vh] w-auto rounded-2xl shadow-2xl border border-white/20 bg-black"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <img
            key={preview.url}
            src={resolveAssistantMediaSrc(preview.url, false)}
            alt="图片大图预览"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget;
              if (!target.dataset.hasRetried && preview.url && !/^(data:|blob:)/.test(preview.url)) {
                target.dataset.hasRetried = 'true';
                target.src = proxyMediaUrl(preview.url);
              }
            }}
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20 cursor-zoom-out"
          />
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 px-5 py-2 rounded-full bg-slate-900/90 text-white text-xs font-bold border border-white/10 hover:bg-slate-800 transition-colors shadow-lg cursor-pointer dark:hover:bg-slate-200"
        >
          关闭预览
        </button>
      </div>
    </div>
  );
}
