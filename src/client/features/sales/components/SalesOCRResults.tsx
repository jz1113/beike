import { Check, Loader2, Plus, RotateCcw, ScanText, X } from 'lucide-react';
import type { SalesOCRImage } from '../model/salesOCR';
import type { SalesOCRProps } from './salesOCRTypes';
import { salesFocusClass } from './salesChrome';
import { SalesOCRSummary } from './SalesOCRSummary';
import { SalesImageThumbnail } from './SalesImageThumbnail';

function imageStatus(entry: SalesOCRImage | undefined, running: boolean, unavailable: boolean) {
  if (running) return { label: '识别中', tone: 'running' };
  if (unavailable) return { label: '不可用', tone: 'error' };
  if (entry?.error) return { label: '失败', tone: 'error' };
  if (!entry?.result) return { label: '待识别', tone: 'waiting' };
  if (!entry.editedText.trim()) return { label: '无文字', tone: 'empty' };
  return { label: '已识别', tone: 'confirmed' };
}

/** 紧凑横向识别图片队列，与视频参考图独立管理。 */
export function SalesOCRQueueStrip({
  state,
  disabled,
  onChange,
  onRecognize,
  onAddOCRImages,
  onRequestImages,
  progress,
}: {
  onAddOCRImages?: (urls: string[]) => void;
  onRequestImages?: () => void;
} & Pick<SalesOCRProps, 'state' | 'disabled' | 'onChange' | 'onRecognize' | 'progress'>) {
  const selected = state.imageCatalog.filter((image) => state.ocrImageUrls.includes(image.url));
  const unqueuedDetails = state.imageCatalog.filter((image) => !image.unavailable && image.role === 'detail' && !state.ocrImageUrls.includes(image.url));
  const fallbackCandidates = unqueuedDetails.length
    ? unqueuedDetails.slice(0, 6)
    : state.imageCatalog.filter((image) => !image.unavailable && !state.ocrImageUrls.includes(image.url)).slice(0, 6);

  return (
    <div className="sales-ocr-strip-thumbs" role="group" aria-label="文字识别队列">
      <span className="sales-ocr-strip-label">识别图片 <strong>{selected.length}</strong> 张</span>
      {selected.map((image) => {
        const item = state.ocrImages.find((value) => value.imageUrl === image.url);
        const itemStatus = imageStatus(item, progress?.imageUrl === image.url, Boolean(image.unavailable));
        const retry = Boolean(item?.result || item?.error);
        const recognitionLabel = item?.result ? '重新识别' : item?.error ? '重试识别' : '识别';
        return (
          <div key={image.url} className={`sales-ocr-thumb-chip is-${itemStatus.tone}`} title={`#${image.index + 1} · ${item?.error || itemStatus.label}`}>
            <div className="sales-ocr-thumb-box">
              <SalesImageThumbnail url={image.url} index={image.index} alt={`文字图片 #${image.index + 1}`} size={160} />
              {itemStatus.tone === 'running' && (
                <span className="sales-ocr-queue-badge is-running" aria-label="识别中">
                  <Loader2 size={10} className="animate-spin" aria-hidden />
                </span>
              )}
              {itemStatus.tone === 'confirmed' && (
                <span className="sales-ocr-queue-badge is-confirmed" aria-label="已识别">
                  <Check size={9} aria-hidden />
                </span>
              )}
              <button
                type="button"
                disabled={disabled || Boolean(progress) || image.unavailable}
                onClick={() => onRecognize(image.url, retry)}
                aria-label={`${recognitionLabel}图片 #${image.index + 1}`}
                title={`${recognitionLabel}此图片文字`}
                className={`sales-ocr-retry ${salesFocusClass}`}
              >
                {retry ? <RotateCcw size={10} aria-hidden /> : <ScanText size={10} aria-hidden />}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ocrImageUrls: state.ocrImageUrls.filter((url) => url !== image.url) })}
                aria-label={`移出文字图 #${image.index + 1}`}
                title="移出队列"
                className={`sales-ocr-thumb-remove ${salesFocusClass}`}
              >
                <X size={10} aria-hidden />
              </button>
            </div>
            <span className="sales-ocr-thumb-caption">
              <i className={`is-${itemStatus.tone}`} aria-hidden />#{image.index + 1}
            </span>
          </div>
        );
      })}
      {(onRequestImages || (onAddOCRImages && fallbackCandidates.length > 0)) && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onRequestImages ? onRequestImages() : onAddOCRImages?.(fallbackCandidates.map((image) => image.url))}
          title={fallbackCandidates.length ? `默认添加前 ${fallbackCandidates.length} 张${unqueuedDetails.length ? '详情图' : '商品图'}，可逐张移除或继续拖入` : '上传用于识别的详情图'}
          className={`sales-ocr-thumb-drop ${salesFocusClass}`}
        >
          <Plus size={13} aria-hidden />
          <span>添加详情图</span>
        </button>
      )}
    </div>
  );
}

export function SalesOCRResults({ state, disabled, onChange, onAddOCRImages }: Pick<SalesOCRProps, 'state' | 'disabled' | 'onChange'> & { onAddOCRImages: (urls: string[]) => void }) {
  const historical = state.ocrImages.filter((item) => !state.ocrImageUrls.includes(item.imageUrl) && (item.result || item.editedText));
  return (
    <section className="sales-ocr-results" aria-label="识别文字编辑">
      {historical.length > 0 && <details className="sales-ocr-raw">
        <summary className={salesFocusClass}>已保存的历史原文 · {historical.length} 张</summary>
        {historical.map((item) => <p key={item.imageUrl}>{item.editedText}</p>)}
        <button type="button" disabled={disabled} className={salesFocusClass} onClick={() => onAddOCRImages(historical.map((item) => item.imageUrl))}>使用这些原文提炼卖点</button>
      </details>}
      <SalesOCRSummary state={state} disabled={disabled} onChange={onChange} />
    </section>
  );
}
