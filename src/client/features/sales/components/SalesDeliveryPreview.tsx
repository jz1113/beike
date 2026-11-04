import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertCircle, Download, Film, Loader2, RotateCcw } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { describeMediaPlaybackError } from '@client/shared/media/mediaPlayback';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

export function SalesDeliveryPreview({ active, rawVideoUrl, finalVideoUrl, generating, mixing, progressText, durationSec, aspectRatio, importControl, productImageUrl }: {
  active: boolean;
  rawVideoUrl: string;
  finalVideoUrl: string;
  generating: boolean;
  mixing: boolean;
  progressText: string;
  durationSec: number;
  aspectRatio: string;
  importControl?: ReactNode;
  productImageUrl?: string;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [measured, setMeasured] = useState({ url: '', seconds: 0, width: 0, height: 0 });
  const [failedProductImage, setFailedProductImage] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const probe = useRef<AbortController | null>(null);
  const [playback, setPlayback] = useState({ url: '', status: 'loading', error: '' });
  const final = Boolean(finalVideoUrl && !showRaw);
  const url = final ? finalVideoUrl : rawVideoUrl;
  const mediaUrl = proxyMediaUrl(url, { asVideo: true });
  const displayedDuration = measured.url === mediaUrl && measured.seconds ? measured.seconds : durationSec;
  const status = playback.url === mediaUrl ? playback.status : 'loading';
  const failed = Boolean(url && status === 'error');
  useEffect(() => { setShowRaw(false); }, [rawVideoUrl, finalVideoUrl]);
  useEffect(() => { if (!active) video.current?.pause(); }, [active]);
  useEffect(() => () => { probe.current?.abort(); }, [mediaUrl]);
  const pending = generating || mixing;
  const ratioLabel = aspectRatio === 'adaptive' ? '智能画幅' : aspectRatio;
  const [ratioWidth, ratioHeight] = aspectRatio.split(':').map(Number);
  const hasDimensions = measured.url === mediaUrl && measured.width > 0 && measured.height > 0;
  const frameRatio = hasDimensions ? measured.width / measured.height
    : ratioWidth > 0 && ratioHeight > 0 ? ratioWidth / ratioHeight : 9 / 16;
  const previewStatus = pending ? mixing ? '混音中' : '渲染中'
    : !url ? '待机' : failed ? '加载失败' : status !== 'ready' ? '正在加载' : final ? '成片就绪' : '原片就绪';
  const markReady = () => {
    probe.current?.abort();
    setPlayback({ url: mediaUrl, status: 'ready', error: '' });
  };
  const retry = () => {
    probe.current?.abort();
    setPlayback({ url: mediaUrl, status: 'loading', error: '' });
    video.current?.load();
  };
  const handleError = async () => {
    const code = video.current?.error?.code;
    probe.current?.abort();
    const controller = new AbortController();
    probe.current = controller;
    setPlayback({ url: mediaUrl, status: 'error', error: '视频加载失败，正在检查播放链接…' });
    const error = await describeMediaPlaybackError(mediaUrl, code, controller.signal);
    if (!controller.signal.aborted) setPlayback({ url: mediaUrl, status: 'error', error });
  };

  return (
    <aside className="sales-delivery-preview" aria-label="视频预览与下载">
      <div className="sales-delivery-preview-heading">
        <strong>
          <span className={`sales-viewfinder-dot${pending ? ' is-rec' : failed ? ' is-error' : url && status === 'ready' ? ' is-ready' : ''}`} aria-hidden />
          视频预览
        </strong>
        <div className="flex flex-wrap items-center gap-2">
          {finalVideoUrl && rawVideoUrl && (
            <div className="sales-delivery-preview-switch" aria-label="选择预览版本">
              <button type="button" aria-pressed={showRaw} onClick={() => setShowRaw(true)} className={salesFocusClass}>原视频</button>
              <button type="button" aria-pressed={!showRaw} onClick={() => setShowRaw(false)} className={salesFocusClass}>最终成片</button>
            </div>
          )}
          {importControl}
          {url && (
            <a
              href={proxyMediaUrl(url, { asVideo: true })}
              download={final ? 'ecommerce-final.mp4' : ''}
              className={`${salesGhostButtonClass} sales-delivery-download ${salesFocusClass}`}
            >
              <Download size={13} aria-hidden />
              {final ? '下载成片' : '下载原视频'}
            </a>
          )}
          <span className="sales-viewfinder-meta" title={pending ? progressText : undefined}>
            {hasDimensions ? `${measured.width} × ${measured.height}` : ratioLabel} · {displayedDuration}s · {previewStatus}
          </span>
        </div>
      </div>

      <div className="sales-delivery-viewfinder" style={{ '--sales-frame-ratio': frameRatio } as CSSProperties}>
        <div className={`sales-delivery-screen${url ? ' has-video' : ''}${generating || (mixing && !url) ? ' is-generating' : ''}`} aria-busy={pending || Boolean(url && status === 'loading')}>
          {url && !generating ? (
            <>
              <video key={mediaUrl} onLoadedMetadata={(event) => {
                const { duration, videoWidth, videoHeight } = event.currentTarget;
                setMeasured({ url: mediaUrl, seconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 100) / 100 : 0,
                  width: videoWidth, height: videoHeight });
              }} ref={video} className={failed ? 'is-unavailable' : undefined} aria-label={final ? '最终成片预览' : '原视频预览'}
                controls playsInline preload={active ? 'metadata' : 'none'} src={mediaUrl} onLoadedData={markReady} onCanPlay={markReady} onError={() => { void handleError(); }} />
              {failed ? (
                <div className="sales-delivery-playback-message" role="alert">
                  <AlertCircle size={24} aria-hidden />
                  <strong>视频暂时无法播放</strong>
                  <p>{playback.error}</p>
                  <button type="button" onClick={retry} className={`${salesGhostButtonClass} ${salesFocusClass}`}><RotateCcw size={13} aria-hidden />重新加载视频</button>
                </div>
              ) : status === 'loading' && active ? (
                <div className="sales-delivery-playback-message is-loading" role="status"><Loader2 size={22} className="animate-spin" aria-hidden /><p>正在加载视频…</p></div>
              ) : null}
            </>
          ) : pending ? (
            <div className="sales-viewfinder-generating" role="status">
              <div className="sales-render-frame" aria-hidden="true">
                {productImageUrl && productImageUrl !== failedProductImage && <img src={proxyMediaUrl(productImageUrl, { thumb: true, width: 720 })}
                  alt="" onError={() => setFailedProductImage(productImageUrl)} />}
              </div>
              <strong>{mixing ? '正在混音合成成片' : '正在渲染分镜画面'}</strong>
              <p>{progressText || '完成后将自动载入播放器，可随时试看与下载。'}</p>
            </div>
          ) : productImageUrl && productImageUrl !== failedProductImage ? (
            <figure className="sales-delivery-reference-still">
              <img alt="本次使用的商品参考图" src={proxyMediaUrl(productImageUrl, { thumb: true, width: 720 })}
                onError={() => setFailedProductImage(productImageUrl)} />
              <figcaption><span>商品参考图</span><strong>等待生成视频</strong></figcaption>
            </figure>
          ) : (
            <div className="sales-delivery-preview-empty">
              <div className="sales-delivery-preview-icon">
                <Film size={22} aria-hidden />
              </div>
              <strong>等待生成或导入画面</strong>
              <p>确认使用素材后点击「生成视频」，或在上方导入已有视频。</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
