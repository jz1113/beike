import { Copy, Check, RefreshCw, Download } from 'lucide-react';
import type { BatchProductItem } from '../../model/batchTypes';

interface Props {
  item: BatchProductItem;
  copiedId: string | null;
  titleText: string;
  contentText: string;
  titleLength: number;
  contentLength: number;
  tags: string[];
  successCount: number;
  isExportingZip: boolean;
  generateCopywritingForProduct: (item: BatchProductItem) => Promise<void>;
  updateItemCopywriting?: (itemId: string, copywriting: { title: string; content: string; tags?: string[] }) => void;
  handleExportSingleProductZip?: (item: BatchProductItem) => Promise<void>;
  onCopyAll: (item: BatchProductItem) => void;
  readOnly?: boolean;
}

export function BatchStage4CopyPanel({
  item, copiedId, titleText, contentText, titleLength, contentLength, tags, successCount, isExportingZip,
  generateCopywritingForProduct, updateItemCopywriting, handleExportSingleProductZip, onCopyAll, readOnly = false,
}: Props) {
  const cw = item.copywriting || { title: '', content: '', tags: [] };
  return (
    <div className="lg:col-start-2 min-w-0 bg-white rounded-xl border border-slate-200/80 p-4 sm:p-5 space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">文案交付</h3>
          </div>
          {item.copywritingError && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <span>{item.copywritingError}</span>
              {!readOnly && <button type="button" onClick={() => generateCopywritingForProduct(item)} disabled={item.isCopywritingGenerating || successCount === 0} className="font-bold underline">重试文案</button>}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!readOnly && <button type="button" onClick={() => generateCopywritingForProduct(item)} disabled={item.isCopywritingGenerating || successCount === 0}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
              <RefreshCw className={`h-3.5 w-3.5 ${item.isCopywritingGenerating ? 'animate-spin' : ''}`} />
              {item.isCopywritingGenerating ? '生成中…' : contentText ? '重写文案' : '生成文案'}
            </button>}
          <button type="button" onClick={() => onCopyAll(item)} disabled={!titleText && !contentText && !tags.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
            {copiedId === `all_${item.id}` ? <><Check className="w-3.5 h-3.5" /><span className="font-bold">已复制</span></> : <><Copy className="w-3.5 h-3.5" /><span>一键复制</span></>}
          </button>
          </div>
        </div>
        {!readOnly && successCount === 0 && <p className="text-xs leading-5 text-slate-500">至少有一张有效成图后可生成文案，也可先手动填写。</p>}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">标题</label>
            <span className={`text-xs tabular-nums ${titleLength > 0 && (titleLength < 5 || titleLength > 20) ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>{titleLength}/20 字{titleLength > 0 && titleLength < 5 ? ' · 至少 5 字' : ''}</span>
          </div>
          <input aria-label="文案标题" type="text" value={titleText}
            disabled={readOnly}
            onChange={(e) => updateItemCopywriting?.(item.id, { title: e.target.value, content: contentText, tags: cw.tags })}
            placeholder="输入 5–20 字的小红书标题，不含表情符号"
            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-colors" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">正文</label>
            <span className={`text-xs tabular-nums ${contentLength > 0 && contentLength < 100 ? 'text-amber-600' : 'text-slate-400'}`}>{contentLength} 字 · 建议至少 100 字</span>
          </div>
          <textarea aria-label="文案正文" value={contentText} rows={5}
            disabled={readOnly}
            onChange={(e) => updateItemCopywriting?.(item.id, { title: titleText, content: e.target.value, tags: cw.tags })}
            placeholder="以真实自用的口吻分享体验，建议至少 100 字"
            className="block w-full min-h-36 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 leading-7 font-normal resize-y placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-colors" />
        </div>
        {tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className="text-[11px] text-slate-400 font-medium">热门标签:</span>
            {tags.map((tag, idx) => (
              <span key={idx} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80">#{tag.replace(/^#/, '')}</span>
            ))}
          </div>
        )}
      </div>
      {handleExportSingleProductZip && <div className="flex justify-end border-t border-slate-100 pt-3">
        <button type="button" onClick={() => handleExportSingleProductZip(item)} disabled={isExportingZip || successCount === 0}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400" title="下载当前商品的图片与文案">
          <Download className="h-3.5 w-3.5" />下载本款图片与文案
        </button>
      </div>}
    </div>
  );
}
