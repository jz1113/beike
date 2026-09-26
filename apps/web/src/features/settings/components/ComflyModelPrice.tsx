import { comflyQuotations, comflyTokenPrice, COMFLY_QUOTATION_DATE, quotationSummary } from '../comflyReferencePrice';
import { formatModelPrice } from '../modelManagement';
import type { ComflyPriceMap } from '../multimodalPriceSort';

export function ComflyModelPrice({ id, prices }: { id: string; prices?: ComflyPriceMap | null }) {
  const quotes = comflyQuotations(id);
  const primary = quotes.find(row => row.group === '默认分组') ?? quotes[0];
  const token = comflyTokenPrice(id, prices);
  const online = Boolean(prices?.[id.toLowerCase()] && token);
  return <div className="min-w-44 max-w-sm text-xs text-slate-600">
    {token ? <><div className="font-mono whitespace-nowrap">{formatModelPrice(token.promptPer1k)} / {formatModelPrice(token.completionPer1k)}</div><div className="text-[10px] text-slate-500 mt-1">฿ / 1K token · 输入 / 输出</div></>
      : primary ? <div className="leading-5">{quotationSummary(primary)}</div> : <span className="text-slate-400">暂无匹配报价</span>}
    {(token || primary) && <p className="text-[10px] text-slate-500 mt-1">{token ? '默认分组' : primary.group} · {online ? '在线' : COMFLY_QUOTATION_DATE}</p>}
    {quotes.length > 0 && <details className="mt-1.5"><summary className="cursor-pointer text-indigo-600 text-[11px]">报价单 · {quotes.length} 个分组</summary><div className="mt-3 space-y-3 max-h-72 overflow-y-auto pr-2">{quotes.map((quote, index) => <div key={`${quote.group}-${index}`}><p className="font-medium text-slate-800">{quote.group}</p><p className="mt-1 whitespace-pre-wrap leading-5 text-[11px]">{quote.detail}</p><p className="text-[10px] text-slate-400">报价单第 {quote.page} 页 · {COMFLY_QUOTATION_DATE}</p></div>)}</div></details>}
  </div>;
}
