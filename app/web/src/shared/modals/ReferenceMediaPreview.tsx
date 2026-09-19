import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { isVideoMediaUrl } from '@/lib/mediaHelper';

/** A nested preview stays inside the app and never navigates the desktop webview. */
export function ReferenceMediaPreview({ url, onClose }: { url: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
      } else if (event.key.startsWith('Arrow') || event.key === ' ') {
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);
  const video = isVideoMediaUrl(url);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="参考素材预览" className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center p-6 pt-20" onClick={event => { event.stopPropagation(); onClose(); }}>
      <button ref={closeRef} type="button" aria-label="关闭参考素材预览" onClick={event => { event.stopPropagation(); onClose(); }} className="absolute top-10 right-4 z-10 rounded-full bg-white text-slate-900 px-4 py-2 flex items-center gap-2 shadow-lg">
        <X className="w-5 h-5" />关闭 · Esc
      </button>
      {video ? <video src={proxyMediaUrl(url, { asVideo: true })} controls playsInline className="max-w-full max-h-full object-contain" onClick={event => event.stopPropagation()} />
        : <img src={proxyMediaUrl(url)} alt="参考素材原图" className="max-w-full max-h-full object-contain" onClick={event => event.stopPropagation()} />}
    </div>, document.body,
  );
}
