import { ChevronDown } from 'lucide-react';
import { comflyQuotations, comflyTokenPrice, COMFLY_QUOTATION_DATE, quotationSummary } from '../../model/comflyReferencePrice';
import { formatModelPrice } from '../../model/modelManagement';
import type { ComflyPriceMap } from '../../model/multimodalPriceSort';

export function ComflyModelPrice({ id, prices }: { id: string; prices?: ComflyPriceMap | null }) {
  const quotes = comflyQuotations(id);
  const primaryIndex = Math.max(0, quotes.findIndex(row => row.group === '默认分组'));
  const primary = quotes[primaryIndex];
  const otherQuotes = quotes.filter((_, index) => index !== primaryIndex);
  const allQuotes = primary ? [primary, ...otherQuotes] : otherQuotes;
  const token = comflyTokenPrice(id, prices);
  const online = Boolean(prices?.[id.toLowerCase()] && token);

  return (
    <div className="settings-price space-y-2 text-xs text-slate-600 dark:text-slate-300">
      {token ? <div className="settings-price-values">
        <div><span>输入</span><strong>฿{formatModelPrice(token.promptPer1k)}</strong></div>
        <div><span>输出</span><strong>฿{formatModelPrice(token.completionPer1k)}</strong></div>
      </div> : primary ? <p className="font-semibold text-sm text-slate-800 dark:text-slate-100">{quotationSummary(primary)}</p> : <span className="text-slate-400">暂无报价</span>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        {token && <span>每 1K token</span>}
        {online && <span title="默认分组价格来自在线接口">在线报价</span>}
      </div>
      {allQuotes.length > 0 && <details className="group">
        <summary className="flex w-fit list-none items-center gap-1 [&::-webkit-details-marker]:hidden">报价详情<ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" /></summary>
        <div className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 dark:bg-white/5 dark:border-white/10">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">报价单 · {COMFLY_QUOTATION_DATE} · {allQuotes.length} 个分组</p>
          {allQuotes.map((quote, index) => <div key={`${quote.group}-${index}`} className="border-t border-slate-200 pt-2 dark:border-white/10">
            <div className="flex items-center justify-between gap-2"><p className="font-medium text-slate-700 dark:text-slate-200">{quote.group}</p><p className="text-[10px] text-slate-400">第 {quote.page} 页</p></div>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-6">{quote.detail}</p>
          </div>)}
        </div>
      </details>}
    </div>
  );
}
