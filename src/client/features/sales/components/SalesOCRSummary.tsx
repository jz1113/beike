import { useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { patchOCRImage, summarizeSalesOCR } from '../model/salesOCR';
import type { SalesOCRProps } from './salesOCRTypes';
import { salesFocusClass } from './salesChrome';

type Props = Pick<SalesOCRProps, 'state' | 'disabled' | 'onChange'> & { imageUrls?: string[]; historical?: boolean };

export function SalesOCRSummary({ state, disabled, onChange, imageUrls = state.ocrImageUrls, historical = false }: Props) {
  const summary = useMemo(() => summarizeSalesOCR(state.imageCatalog, imageUrls, state.ocrImages), [state.imageCatalog, imageUrls, state.ocrImages]);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const [copyStatus, setCopyStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const selectedImages = state.imageCatalog.filter((image) => imageUrls.includes(image.url));
  const copy = async () => {
    try { await navigator.clipboard.writeText(summary.text); setCopyStatus({ text: summary.text, ok: true }); }
    catch { fallbackRef.current?.focus(); fallbackRef.current?.select(); setCopyStatus({ text: summary.text, ok: false }); }
  };

  return (
    <article className="sales-ocr-document" aria-label="识别文字原文">
      <div className="sales-document-toolbar">
        <div className="sales-document-heading">
          <h3>{historical ? '历史识别原文' : '识别原文'}</h3>
          <p>{historical ? '已保存的历史原文；加入识别队列后可用于提炼。' : '核对并修改原文，提炼时使用当前文字。'}</p>
        </div>
        <button type="button" disabled={!summary.text} onClick={() => { void copy(); }} aria-label="复制全部文字" className={`sales-summary-copy ${salesFocusClass}`}>
          {copyStatus?.text === summary.text && copyStatus.ok ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          {copyStatus?.text === summary.text && copyStatus.ok ? '已复制' : '复制全部'}
        </button>
      </div>
      <div className="sales-ocr-groups-scroll">
        {selectedImages.map((image) => {
          const entry = state.ocrImages.find((item) => item.imageUrl === image.url);
          return <div key={image.url} className="sales-ocr-group-row">
            <div className="sales-ocr-group-tag"><strong>#{image.index + 1}</strong></div>
            <div className="sales-ocr-group-editor">
              {entry?.error && <p className="sales-ocr-group-hint is-err">{entry.error}，可从队列或底部重试。</p>}
              <textarea aria-label={`图片 #${image.index + 1} 识别文字`} disabled={disabled} maxLength={40000} rows={Math.min(16, Math.max(4, entry?.editedText.split('\n').length || 4))} value={entry?.editedText ?? ''} placeholder={entry?.result ? '未识别到文字，可手动补充或留空跳过' : '等待识别，也可直接输入或粘贴图片中的文字'} onChange={(event) => onChange({ ocrImages: patchOCRImage(state.ocrImages, image.url, { editedText: event.target.value }) })} />
              {entry?.result && <details className="sales-ocr-raw"><summary className={salesFocusClass}>查看未修订识别文字</summary><p>{entry.result.text || '此图片未识别到文字'}</p></details>}
            </div>
          </div>;
        })}
      </div>
      <textarea ref={fallbackRef} aria-label="汇总识别文字" readOnly value={summary.text} className="sr-only" tabIndex={-1} />
      {copyStatus?.text === summary.text && !copyStatus.ok && <p className="sales-copy-error" role="status">复制失败，请手动选中文字复制。</p>}
    </article>
  );
}
