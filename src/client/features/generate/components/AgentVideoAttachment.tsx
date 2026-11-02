import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Film, LoaderCircle, Play, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import type { ParsedAttachment } from '@client/shared/media/agentArtifact';

/** Match the compact reference-image tile; playback opens only on request. */
export default function AgentVideoAttachment({ item }: { item: ParsedAttachment }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useModalDialog(open, () => setOpen(false));
  const src = proxyMediaUrl(item.url, { asVideo: true });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={`播放视频：${item.name}`}
        aria-label={`播放视频：${item.name}`}
        className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-black/5 shadow-2xs focus-visible:outline-2 focus-visible:outline-slate-400 dark:border-white/10 dark:bg-white/5">
        {!failed && (
          <video src={src} muted playsInline preload="metadata" aria-hidden="true"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (Number.isFinite(video.duration) && video.duration > 0) {
                video.currentTime = Math.min(0.1, video.duration / 2);
              }
            }}
            onLoadedData={() => setReady(true)}
            onSeeked={() => setReady(true)}
            onError={() => setFailed(true)}
            className="pointer-events-none h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        )}
        {!ready && !failed && <LoaderCircle aria-label="正在加载预览" className="absolute left-7 top-6 h-5 w-5 animate-spin text-slate-400" />}
        {failed && <Film className="absolute left-7 top-5 h-6 w-6 text-slate-400" />}
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Play className="h-5 w-5 fill-white drop-shadow" />
        </span>
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-center text-[10px] text-white backdrop-blur-xs">参考视频</span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={() => setOpen(false)}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`视频预览：${item.name}`} tabIndex={-1}
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col items-center gap-3" onClick={event => event.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭视频预览"
              className="self-end rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white">
              <X className="h-5 w-5" />
            </button>
            <video src={src} controls autoPlay playsInline preload="auto" aria-label={item.name}
              className="max-h-[75vh] w-full rounded-xl bg-black object-contain" />
            <span className="max-w-full truncate text-xs text-slate-300" title={item.name}>{item.name}</span>
          </div>
        </div>, document.body,
      )}
    </>
  );
}
