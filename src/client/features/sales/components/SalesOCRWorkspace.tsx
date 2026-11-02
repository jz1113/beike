import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ArrowRight, Loader2, Upload, X } from 'lucide-react';
import { readSalesImageDrag, SALES_IMAGE_DRAG_TYPE } from '../model/salesImageDrag';
import { salesSummarySource } from '../model/salesSummary';
import { useSalesSummaryModels } from '../hooks/useSalesSummaryModels';
import { PRODUCT_IMAGE_ACCEPT, imagesFromDataTransfer } from '../model/productImageDrop';
import type { SalesOCRProps } from './salesOCRTypes';
import { SalesOCRQueueStrip, SalesOCRResults } from './SalesOCRResults';
import { SalesSellingPoints } from './SalesSellingPoints';
import { SalesProductBottomBar } from './SalesProductBottomBar';
import { salesFocusClass } from './salesChrome';

interface Props extends SalesOCRProps {
  imageDragging: boolean;
  onAddOCRImages: (urls: string[]) => void;
  onDropFinished: () => void;
  onUploadOCRImages?: (files: File[]) => void | Promise<void>;
}

export function SalesOCRWorkspace(props: Props) {
  const { state, disabled, onChange, onRecognize, progress, report, imageDragging, onAddOCRImages, onDropFinished, onUploadOCRImages, summaryActions } = props;
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState('');
  const { model } = useSalesSummaryModels(state.summaryModel);
  const dragDepth = useRef(0);
  const uploadRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!imageDragging) { dragDepth.current = 0; setOver(false); } }, [imageDragging]);
  const source = salesSummarySource(state);
  const stale = state.productSummary && state.productSummary.inputKey !== source.inputKey;
  const addImages = (urls: string[]) => onAddOCRImages(urls);
  const hasText = Boolean(state.sellingPoints.trim() || source.textCount);
  const stage = progress ? '识别中' : summaryActions?.pending ? '提炼中' : state.productSummary ? '已提炼' : hasText ? '待提炼' : '待识别';
  const extractionReason = (hasText || state.productSummary) && !summaryActions?.pending && !progress ? source.error || (!model ? '请在底部选择卖点提炼模型。' : '') : '';
  const recognize = (url?: string, force?: boolean) => { setNotice(''); onRecognize(url, force); };
  const requestImages = () => {
    const available = state.imageCatalog.filter((image) => !image.unavailable && !state.ocrImageUrls.includes(image.url));
    const details = available.filter((image) => image.role === 'detail');
    const candidates = (details.length ? details : available).slice(0, 6);
    if (candidates.length) addImages(candidates.map((image) => image.url));
    else uploadRef.current?.click();
  };
  const upload = async (files: File[]) => {
    if (!files.length || !onUploadOCRImages) return;
    setNotice('');
    try { await onUploadOCRImages(files); }
    catch { setNotice('图片添加失败，请重新选择。'); }
  };

  const accepts = (event: DragEvent<HTMLElement>) => event.dataTransfer.types.includes(SALES_IMAGE_DRAG_TYPE) || Boolean(onUploadOCRImages && event.dataTransfer.types.includes('Files'));
  const onDrop = async (event: DragEvent<HTMLElement>) => {
    if (!accepts(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setOver(false);
    dragDepth.current = 0;
    onDropFinished();
    if (disabled || summaryActions?.pending) return;
    if (event.dataTransfer.types.includes('Files')) {
      try { await upload(await imagesFromDataTransfer(event.dataTransfer)); }
      catch { setNotice('图片读取失败，请使用添加详情图重新选择。'); }
      return;
    }
    const url = readSalesImageDrag(event.dataTransfer.getData(SALES_IMAGE_DRAG_TYPE), state.imageCatalog);
    if (!url) { setNotice('图片已失效，请从当前图片库重新拖入。'); return; }
    addImages([url]);
    setNotice(state.ocrImageUrls.includes(url) ? '图片已在队列中' : '');
  };
  const editingDisabled = disabled || Boolean(summaryActions?.pending);
  const showSkip = !state.productSummary && Boolean(summaryActions?.onScrollToProduction);

  return (
    <section
      className={`sales-ocr-workspace ${!editingDisabled && imageDragging ? 'is-drag-ready' : ''} ${over ? 'is-drag-over' : ''}`}
      aria-label="商品卖点工作区"
      onDragEnter={(event) => { if (!accepts(event) || editingDisabled) return; event.preventDefault(); dragDepth.current += 1; setOver(true); }}
      onDragOver={(event) => { if (!accepts(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = editingDisabled ? 'none' : 'copy'; }}
      onDragLeave={(event) => { if (!accepts(event)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setOver(false); }}
      onDrop={(event) => { void onDrop(event); }}
    >
      <input ref={uploadRef} type="file" accept={PRODUCT_IMAGE_ACCEPT} multiple hidden disabled={editingDisabled} aria-label="添加用于识别的详情图" onChange={(event) => { const files = [...(event.target.files || [])]; event.target.value = ''; void upload(files); }} />
      <header className="sales-summary-meta sales-product-content-head">
        <div className="sales-product-content-title">
          <h2>商品卖点</h2>
          <span className="sales-product-stage" role="status">{stage}</span>
        </div>
      </header>

      <div className="sales-product-material-body">
        <div className="sales-product-working-content">
          {(state.ocrImageUrls.length > 0 || showSkip) && (
            <div className="sales-ocr-strip-bar">
              {state.ocrImageUrls.length > 0 && <SalesOCRQueueStrip state={state} disabled={editingDisabled} onChange={onChange} onRecognize={recognize} onAddOCRImages={addImages} onRequestImages={requestImages} progress={progress} />}
              <div className="sales-product-top-actions">
                {state.ocrImageUrls.length > 0 && <button type="button" disabled={editingDisabled} onClick={() => { onChange({ ocrImageUrls: [] }); setNotice(''); }} title="清空识别图片，保留已识别文字" className={`sales-panel-clear ${salesFocusClass}`}>
                  清空识别图片
                </button>}
                {showSkip && <button type="button" disabled={editingDisabled || Boolean(progress)} onClick={summaryActions?.onScrollToProduction} className={`sales-storyboard-skip ${salesFocusClass}`}>
                  跳过，进入分镜<ArrowRight size={14} aria-hidden />
                </button>}
              </div>
            </div>
          )}
          {notice && <div className="sales-drop-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="关闭队列提示" title="关闭提示" className={salesFocusClass}><X size={12} /></button></div>}
          {(progress || summaryActions?.pending) && <p className="sales-selling-progress" role="status"><Loader2 size={14} className="animate-spin" aria-hidden />{progress ? `正在识别文字 ${progress.completed}/${progress.total} 张，已有文字会保留。` : '正在提炼卖点，已有内容会保留。'}</p>}
          {summaryActions?.error && <p role="alert" className="sales-selling-error">{summaryActions.error}，可重试提炼，已有内容已保留。</p>}
          {report && !progress && (report.failed > 0 || report.remaining > 0 || report.message) && <p className="sales-selling-error" role="status">{report.message || `识别完成 ${report.succeeded} 张${report.failed ? `，失败 ${report.failed} 张` : ''}${report.remaining ? `，剩余 ${report.remaining} 张` : ''}`}。已有文字已保留，可从识别图片中重试。</p>}
          {stale && !summaryActions?.pending && <p className="sales-selling-notice" role="status">商品文字已更新，可展开识别原文核对并重新提炼。</p>}
          {extractionReason && <p className="sales-selling-notice" role="status">{extractionReason}</p>}
          {state.productSummary ? (
            <>
              <SalesSellingPoints state={state} disabled={editingDisabled} onChange={onChange} />
              <details key={state.productSummary.generatedAt} className="sales-original-disclosure">
                <summary className={salesFocusClass}>查看识别原文</summary>
                <SalesOCRResults state={state} disabled={editingDisabled} onChange={onChange} onRecognize={recognize} onAddOCRImages={addImages} onRequestImages={requestImages} progress={progress} summaryActions={summaryActions} />
              </details>
            </>
          ) : (
            <SalesOCRResults state={state} disabled={editingDisabled} onChange={onChange} onRecognize={recognize} onAddOCRImages={addImages} onRequestImages={requestImages} progress={progress} summaryActions={summaryActions} />
          )}
        </div>
      </div>

      <SalesProductBottomBar {...props} onRecognize={recognize} onAddOCRImages={addImages} onRequestImages={requestImages} />
      {!editingDisabled && (imageDragging || over) && <div className="sales-drop-overlay" aria-hidden><Upload size={20} /><strong>{over ? '松开，加入文字识别队列' : '拖到这里识别图片文字'}</strong></div>}
    </section>
  );
}
