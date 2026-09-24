import { Copy, Check, RefreshCw, Download } from 'lucide-react';
import type { BatchProductItem } from '../model/batchTypes';

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
    <div className="lg:col-start-2 min-w-0 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 space-y-3">
      <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
        {!readOnly && <button type="button" onClick={() => generateCopywritingForProduct(item)} disabled={item.isCopywritingGenerating}
          className="flex-1 py-2 px-2 rounded-xl text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
          title="重新为当前款生成小红书种草文案">
          <RefreshCw className={`w-3.5 h-3.5 ${item.isCopywritingGenerating ? 'animate-spin' : ''}`} />
          <span>{item.isCopywritingGenerating ? '生成中...' : '重写文案'}</span>
        </button>}
        {handleExportSingleProductZip && (
          <button type="button" onClick={() => handleExportSingleProductZip(item)} disabled={isExportingZip || successCount === 0}
            className="flex-1 py-2 px-2 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
            title="打包下载当前款所有图片与文案">
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>导出本款</span>
          </button>
        )}
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-3 bg-amber-500 rounded-full" />
            <h3 className="text-sm font-semibold text-slate-800">文案交付</h3>
          </div>
          {item.copywritingError && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <span>{item.copywritingError}</span>
              {!readOnly && <button type="button" onClick={() => generateCopywritingForProduct(item)} className="font-bold underline">重试文案</button>}
            </div>
          )}
          <button type="button" onClick={() => onCopyAll(item)} disabled={!titleText && !contentText && !tags.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            {copiedId === `all_${item.id}` ? <><Check className="w-3.5 h-3.5" /><span className="font-bold">已复制</span></> : <><Copy className="w-3.5 h-3.5" /><span>一键复制</span></>}
          </button>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700"><span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-bold">标题</span></label>
            <span className={`text-[11px] font-mono ${titleLength > 20 ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>{titleLength}/20 字</span>
          </div>
          <input aria-label="文案标题" type="text" value={titleText}
            disabled={readOnly}
            onChange={(e) => updateItemCopywriting?.(item.id, { title: e.target.value, content: contentText, tags: cw.tags })}
            placeholder="输入 5-20 字无表情包的小红书标题..."
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-base text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-colors" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700"><span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-bold">正文</span></label>
            <span className={`text-[11px] font-mono ${contentLength < 100 ? 'text-amber-500 font-bold' : 'text-slate-400'}`}>{contentLength} 字 · 建议至少 100 字</span>
          </div>
          <textarea aria-label="文案正文" value={contentText} rows={8}
            disabled={readOnly}
            onChange={(e) => updateItemCopywriting?.(item.id, { title: titleText, content: e.target.value, tags: cw.tags })}
            placeholder="输入大于 100 字的真实自用口吻正文..."
            className="soft-textarea w-full min-h-56 p-4 text-sm text-slate-800 leading-7 font-normal resize-y" />
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
    </div>
  );
}
