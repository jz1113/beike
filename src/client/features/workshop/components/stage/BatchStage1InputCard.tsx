import { useId } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { countBatchInputLines } from '../../model/collection/batchCollect';

export interface BatchStage1InputCardProps {
  batchInputText: string;
  setBatchInputText: (val: string) => void;
  isCollecting: boolean;
  hasInputs: boolean;
  collectProgress?: { total: number; current: number; success: number; failed: number };
  handleSmartBatchCollect: () => Promise<void>;
}

export function BatchStage1InputCard({ batchInputText, setBatchInputText, isCollecting, hasInputs, handleSmartBatchCollect, collectProgress }: BatchStage1InputCardProps) {
  const statusId = useId();
  return <section aria-label="导入商品">
    <div className="relative min-h-[300px] overflow-hidden rounded-[32px] border-2 border-dashed border-slate-300 bg-white/80 px-6 py-6 text-left transition hover:border-indigo-300 hover:bg-white focus-within:border-indigo-400 dark:border-white/10 dark:bg-[#1B1B1E]/80 dark:hover:border-indigo-400/50 dark:hover:bg-[#1B1B1E] sm:px-9 sm:py-8">
    <textarea id={`${statusId}-input`} rows={6} disabled={isCollecting} value={batchInputText}
      onChange={event => setBatchInputText(event.target.value)} onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault(); if (!isCollecting && hasInputs) void handleSmartBatchCollect();
        }
      }} placeholder={'每行粘贴一款商品链接或京东 SKU\n\nhttps://item.jd.com/…html\nhttps://item.taobao.com/item.htm?id=…\nhttps://detail.1688.com/offer/…html'} aria-label="商品链接或京东 SKU" aria-describedby={statusId} spellCheck={false}
      className="min-h-[232px] w-full resize-none border-0 bg-transparent p-0 pb-12 text-sm leading-[1.8] text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0 disabled:opacity-60 dark:text-slate-200 dark:placeholder:text-slate-500" />
      <button type="button" onClick={() => void handleSmartBatchCollect()} disabled={isCollecting || !hasInputs} aria-label={isCollecting ? '正在采集' : '开始采集'} title="采集商品（⌘ / Ctrl + Enter）" className="absolute bottom-6 right-6 inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm transition hover:bg-black focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:disabled:bg-white/10 dark:disabled:text-slate-600 sm:bottom-8 sm:right-9">
        {isCollecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.25} />}
      </button>
    </div>
    <div id={statusId} aria-live="polite" className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-left text-xs leading-6 text-slate-500 dark:text-slate-400">
      <span>支持京东、淘宝 / 天猫、1688，重复商品自动跳过，最多 20 款。</span>
      <span>{isCollecting ? `正在采集 ${collectProgress?.current ?? 0}/${collectProgress?.total ?? 0}` : batchInputText.trim() ? `已输入 ${countBatchInputLines(batchInputText)} 条 · ⌘ / Ctrl + Enter 采集` : '⌘ / Ctrl + Enter 采集'}</span>
    </div>
  </section>;
}
