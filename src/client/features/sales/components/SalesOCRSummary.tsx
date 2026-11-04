import { useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { editSalesProductText, salesProductTextParts } from '../model/salesProductText';
import type { SalesOCRProps } from './salesOCRTypes';
import { salesFocusClass } from './salesChrome';

export function SalesOCRSummary({ state, disabled, onChange }: Pick<SalesOCRProps, 'state' | 'disabled' | 'onChange'>) {
  const text = salesProductTextParts(state).map((part) => part.text).join('');
  const editor = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const originals = state.imageCatalog.filter((image) => state.ocrImageUrls.includes(image.url)).flatMap((image) => {
    const entry = state.ocrImages.find((item) => item.imageUrl === image.url);
    return entry?.result ? [{ index: image.index, text: entry.result.text }] : [];
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(text); }
    catch { editor.current?.focus(); editor.current?.select(); }
  };
  return <div className="sales-manual-text">
    <div className="sales-manual-text-heading">
      <label htmlFor="sales-product-text">商品文字</label>
      {originals.length > 0 && <button type="button" popoverTarget="sales-ocr-originals" className={`sales-originals-button ${salesFocusClass}`}>查看原文</button>}
      <button type="button" disabled={!text} onClick={() => { void copy(); }} className={`sales-summary-copy ${salesFocusClass}`} aria-label="复制全部文字">
        <Copy size={12} aria-hidden />{copied === text ? '已复制' : '复制全部'}
      </button>
    </div>
    <textarea id="sales-product-text" ref={editor} disabled={disabled} rows={14} value={text} maxLength={state.ocrImageUrls.length ? 80000 : 20000}
      placeholder="输入商品资料，或添加详情图后识别文字。"
      onChange={(event) => onChange(editSalesProductText(state, event.currentTarget.value, event.currentTarget.selectionStart))} />
    {originals.length > 0 && <div id="sales-ocr-originals" popover="auto" className="sales-originals-popover" aria-label="未修订识别文字">
      <header><strong>查看未修订识别文字</strong><button type="button" popoverTarget="sales-ocr-originals" popoverTargetAction="hide" className={salesFocusClass}>关闭</button></header>
      {originals.map((item) => <p key={item.index}>#{item.index + 1}&#x3000;{item.text || '此图片未识别到文字'}</p>)}
    </div>}
  </div>;
}
