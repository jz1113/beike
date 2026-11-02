import { useEffect, useRef, useState } from 'react';
import { Check, Download, Film, Loader2 } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

export function SalesDeliveryPreview({ active, rawVideoUrl, finalVideoUrl, generating, mixing, progressText, durationSec, aspectRatio }: {
  active: boolean;
  rawVideoUrl: string;
  finalVideoUrl: string;
  generating: boolean;
  mixing: boolean;
  progressText: string;
  durationSec: number;
  aspectRatio: string;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const final = Boolean(finalVideoUrl && !showRaw);
  const url = final ? finalVideoUrl : rawVideoUrl;
  useEffect(() => { setShowRaw(false); }, [rawVideoUrl, finalVideoUrl]);
  useEffect(() => { if (!active) video.current?.pause(); }, [active]);
  const pending = generating || mixing;
  const ratioLabel = aspectRatio === 'adaptive' ? '智能画幅' : aspectRatio;

  return (
    <aside className="sales-delivery-preview" aria-label="视频预览与下载">
      <div className="sales-delivery-preview-heading">
        <strong>
          <span className={`sales-viewfinder-dot${pending ? ' is-rec' : url ? ' is-ready' : ''}`} aria-hidden />
          视频预览
        </strong>
        <div className="flex items-center gap-2">
          {finalVideoUrl && rawVideoUrl && (
            <div className="sales-delivery-preview-switch" aria-label="选择预览版本">
              <button type="button" aria-pressed={showRaw} onClick={() => setShowRaw(true)} className={salesFocusClass}>原视频</button>
              <button type="button" aria-pressed={!showRaw} onClick={() => setShowRaw(false)} className={salesFocusClass}>最终成片</button>
            </div>
          )}
          <span className="sales-viewfinder-meta">
            {ratioLabel} · {durationSec}s · {final ? '成片就绪' : rawVideoUrl ? '原片就绪' : pending ? '渲染中' : '待机'}
          </span>
        </div>
      </div>

      <div className={`sales-delivery-screen${url ? ' has-video' : ''}${pending && !url ? ' is-generating' : ''}`}>
        {url ? (
          <video key={url} ref={video} controls playsInline preload="metadata" src={proxyMediaUrl(url, { asVideo: true })} />
        ) : pending ? (
          <div className="sales-viewfinder-generating">
            <Loader2 size={22} className="animate-spin text-zinc-300" aria-hidden />
            <strong>{mixing ? '正在混音合成成片' : '正在渲染分镜画面'}</strong>
            <p>{progressText || '完成后将自动载入播放器，可随时试看与下载。'}</p>
          </div>
        ) : (
          <div className="sales-delivery-preview-empty">
            <div className="sales-delivery-preview-icon">
              <Film size={22} aria-hidden />
            </div>
            <strong>等待生成或导入画面</strong>
            <p>先在右侧核对引用素材并勾选确认，再点击下方「生成视频」；也可直接导入已有原片合成声音。</p>
            <span>{ratioLabel} · {durationSec} 秒</span>
          </div>
        )}
      </div>

      <div className="sales-delivery-preview-footer">
        {pending ? (
          <p role="status" className="sales-delivery-preview-status">
            <Loader2 size={13} className="animate-spin" aria-hidden />
            {progressText || (mixing ? '正在合成成片…' : '视频生成中…')}
          </p>
        ) : url ? (
          <p className="sales-delivery-preview-status is-done">
            <Check size={13} aria-hidden />
            {final ? '声音已合成，可下载最终成片。' : '可直接下载原视频，或在右侧添加配乐后合成成片。'}
          </p>
        ) : (
          <p className="sales-delivery-preview-footnote">支持原视频与混音成片同屏切换对比。</p>
        )}
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
      </div>
    </aside>
  );
}
