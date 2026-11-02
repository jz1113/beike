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

/** 在商品卖点编辑区中展示 OCR 原文或识别引导。 */
export function SalesOCRResults({ state, disabled, onChange, onAddOCRImages, onRequestImages }: {
  onAddOCRImages?: (urls: string[]) => void;
  onRequestImages?: () => void;
} & Pick<SalesOCRProps, 'state' | 'disabled' | 'onChange' | 'onRecognize' | 'progress' | 'summaryActions'>) {
  const selected = state.imageCatalog.filter((image) => state.ocrImageUrls.includes(image.url));
  const historicalUrls = state.ocrImages.filter((item) => (item.result || item.editedText.trim()) && !state.ocrImageUrls.includes(item.imageUrl)).map((item) => item.imageUrl);
  const quickCandidates = state.imageCatalog.filter((image) => !image.unavailable && image.role === 'detail').slice(0, 6);
  const fallbackCandidates = quickCandidates.length ? quickCandidates : state.imageCatalog.filter((image) => !image.unavailable).slice(0, 6);
  const canAdd = Boolean(onRequestImages || (onAddOCRImages && fallbackCandidates.length));
  const showEmptyGuide = !selected.length && !historicalUrls.length && !state.sellingPoints.trim();
  const hasSource = selected.length > 0 || historicalUrls.length > 0 || showEmptyGuide;
  const addImages = () => onRequestImages ? onRequestImages() : onAddOCRImages?.(fallbackCandidates.map((image) => image.url));

  return (
    <section className={`sales-ocr-results${hasSource ? '' : ' is-manual-only'}`} aria-label="识别文字编辑">
      {hasSource && <div className="sales-ocr-source">
        {selected.length || historicalUrls.length ? (
          <>
            {!selected.length && onAddOCRImages && <div className="sales-document-toolbar"><button type="button" disabled={disabled} onClick={() => onAddOCRImages(historicalUrls)} className={`sales-gallery-quick-btn ${salesFocusClass}`}>使用这些原文提炼卖点</button></div>}
            <SalesOCRSummary state={state} disabled={disabled} onChange={onChange} imageUrls={selected.length ? state.ocrImageUrls : historicalUrls} historical={!selected.length} />
            {selected.length > 0 && historicalUrls.length > 0 && <details className="sales-ocr-notes"><summary>查看其他已识别原文 · {historicalUrls.length} 张</summary><SalesOCRSummary state={state} disabled={disabled} onChange={onChange} imageUrls={historicalUrls} historical /></details>}
          </>
        ) : showEmptyGuide ? (
          <div className="sales-ocr-empty">
            <span className="sales-ocr-empty-icon"><ScanText size={20} aria-hidden /></span>
            <h3>添加详情图，识别商品文字</h3>
            <p>从商品图片中添加，或将图片拖入此处。</p>
            {fallbackCandidates.length > 0 && <span className="sales-ocr-add-hint">默认添加前 {fallbackCandidates.length} 张{quickCandidates.length ? '详情图' : '商品图'}，可调整</span>}
            {canAdd && <div className="sales-ocr-empty-actions"><button type="button" disabled={disabled} onClick={addImages} className={`sales-ocr-add-link ${salesFocusClass}`}><Plus size={13} aria-hidden />添加详情图</button></div>}
          </div>
        ) : null}
      </div>}
      <div className="sales-manual-text">
        <div className="sales-manual-text-heading">
          <label htmlFor="sales-product-text">补充商品文字</label>
          <span className="sales-manual-text-count">{state.sellingPoints.length.toLocaleString('zh-CN')} / 20,000</span>
        </div>
        <p className="sales-manual-text-hint">补充材质、规格、使用体验等信息，与识别原文一起提炼。</p>
        <div className="sales-manual-text-actions">
          {!selected.length && !showEmptyGuide && canAdd && <button type="button" disabled={disabled} onClick={addImages} className={`sales-ocr-add-link ${salesFocusClass}`}><Plus size={13} aria-hidden />添加详情图</button>}
        </div>
        <textarea id="sales-product-text" aria-label="补充商品文字" value={state.sellingPoints} disabled={disabled} maxLength={20000} rows={4} placeholder="也可以直接补充或粘贴商品介绍、材质、功能和卖点。" onChange={(event) => onChange({ sellingPoints: event.target.value })} />
      </div>
    </section>
  );
}
