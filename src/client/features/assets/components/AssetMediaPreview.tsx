import { useState, useEffect, useRef } from 'react';
import { FileText, ImageOff, Music, RotateCw } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import LazyVideoCover from '@client/shared/media/LazyVideoCover';
import { getAssetMediaKind } from '../model/assetMedia';

interface Props {
  src: string;
  mediaType?: string;
  model?: string;
  className?: string;
  objectFit?: 'cover' | 'contain';
  width?: number;
  audioControls?: boolean;
  videoAutoPlay?: boolean;
  posterUrl?: string;
  title?: string;
}

function ImagePreview({ src, objectFit, width, title, onUnavailable }: Props & { onUnavailable?: () => void }) {
  const thumbnail = proxyMediaUrl(src, { thumb: true, width: width || 480 });
  const original = proxyMediaUrl(src);
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div role="img" aria-label="图片暂时无法加载" className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-100 p-3 text-center text-slate-500">
        <ImageOff className="h-6 w-6 shrink-0" />
        <span className="text-[11px]">图片暂时无法加载</span>
      </div>
    );
  }

  return (
    <img
      src={retried ? original : thumbnail}
      alt={title || '生成资产预览'}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!retried && thumbnail !== original) setRetried(true);
        else {
          setFailed(true);
          onUnavailable?.();
        }
      }}
      className={`h-full w-full ${objectFit === 'contain' ? 'object-contain' : 'object-cover'}`}
    />
  );
}

function VideoPreview(props: Props) {
  const [posterFailed, setPosterFailed] = useState(false);
  if (props.videoAutoPlay === false && props.posterUrl && !posterFailed) {
    return <ImagePreview {...props} src={props.posterUrl} onUnavailable={() => setPosterFailed(true)} />;
  }
  return <LazyVideoCover src={proxyMediaUrl(props.src, { asVideo: true })} fallbackSrc={props.src} objectFit={props.objectFit} autoPlay={props.videoAutoPlay} />;
}

function AudioPreview({ src, title }: Props) {
  // The streaming proxy retains audio MIME types and Range requests for seeking.
  const sources = Array.from(new Set([proxyMediaUrl(src, { asVideo: true }), src]));
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playRequested = useRef(false);
  useEffect(() => {
    if (attempt > 0 && playRequested.current) void audioRef.current?.play().catch(() => {});
  }, [attempt]);
  return (
    <>
      <p className="w-full truncate text-center text-[11px] font-medium text-slate-700" title={title}>{title || '音频资产'}</p>
      {failed ? (
        <div className="flex flex-col items-center gap-2">
          <span role="status" className="text-[11px] text-slate-500">音频暂时无法加载</span>
          <button type="button" onClick={event => { event.stopPropagation(); playRequested.current = false; setFailed(false); setAttempt(0); setRetry(previous => previous + 1); }} className="flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-200"><RotateCw className="h-3 w-3" />重新加载</button>
        </div>
      ) : (
        <audio
          key={`${retry}-${attempt}`}
          ref={audioRef}
          src={sources[attempt]}
          controls
          preload="none"
          data-asset-audio="true"
          aria-label={title || '播放音频资产'}
          onPlay={event => {
            playRequested.current = true;
            document.querySelectorAll<HTMLAudioElement>('audio[data-asset-audio]').forEach(audio => {
              if (audio !== event.currentTarget) audio.pause();
            });
          }}
          onPause={event => { if (!event.currentTarget.error) playRequested.current = false; }}
          onError={() => {
            if (attempt < sources.length - 1) setAttempt(attempt + 1);
            else setFailed(true);
          }}
          onClick={event => event.stopPropagation()}
          onKeyDown={event => event.stopPropagation()}
          className="h-8 w-full min-w-0"
        />
      )}
    </>
  );
}

export default function AssetMediaPreview(props: Props) {
  const { src, className = '', audioControls = false } = props;
  const kind = getAssetMediaKind({ ...props, resultUrl: src });
  return (
    <div className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-slate-100 ${className}`}>
      {kind === 'image' ? (
        <ImagePreview key={src} {...props} />
      ) : kind === 'video' ? (
        <VideoPreview key={JSON.stringify([src, props.posterUrl])} {...props} />
      ) : kind === 'audio' ? (
        <div className="flex w-full min-w-0 flex-col items-center gap-3 px-2 py-3 text-indigo-600">
          <Music className="h-7 w-7 shrink-0" />
          {audioControls ? <AudioPreview key={src} {...props} /> : <span className="text-[11px]">音频资产</span>}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-3 text-slate-500"><FileText className="h-7 w-7" /><span className="text-[11px]">文档资产</span></div>
      )}
    </div>
  );
}
