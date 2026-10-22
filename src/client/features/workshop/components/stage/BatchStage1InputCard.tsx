import { useId } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

export interface BatchStage1InputCardProps {
  batchInputText: string;
  setBatchInputText: (val: string) => void;
  isCollecting: boolean;
  hasInputs: boolean;
  collectProgress?: { total: number; current: number; success: number; failed: number };
  handleSmartBatchCollect: () => Promise<void>;
}

export function BatchStage1InputCard({
  batchInputText, setBatchInputText, isCollecting, hasInputs,
  handleSmartBatchCollect, collectProgress,
}: BatchStage1InputCardProps) {
  const statusId = useId();

  return (
    <section aria-label="导入商品" className="relative h-60 overflow-hidden rounded-[30px] border border-dashed border-indigo-400/45 bg-white/30 backdrop-blur-sm transition-colors focus-within:border-indigo-500 hover:border-indigo-400/70 sm:h-[270px] dark:border-indigo-400/50 dark:bg-[#1B1B1E]/40 dark:focus-within:border-indigo-400 dark:hover:border-indigo-400/80">
      <textarea
        rows={6}
        disabled={isCollecting}
        value={batchInputText}
        onChange={e => setBatchInputText(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (!isCollecting && hasInputs) void handleSmartBatchCollect();
          }
        }}
        placeholder={'粘贴商品链接或京东 SKU，每行一款：\nhttps://item.jd.com/100279945637.html\n支持京东、淘宝 / 天猫、1688 商品链接'}
        aria-label="商品链接或京东 SKU"
        aria-describedby={statusId}
        className="h-full w-full resize-none bg-transparent px-6 pt-6 pb-20 text-[13px] leading-[1.65] text-slate-800 outline-none placeholder:text-slate-500 disabled:opacity-60 sm:px-8 sm:pt-7 dark:text-slate-100 dark:placeholder:text-slate-500"
      />
      <div className="pointer-events-none absolute inset-x-6 bottom-6 flex items-center justify-end sm:inset-x-8 sm:bottom-7">
        <div id={statusId} aria-live="polite" className="sr-only">
          {isCollecting ? `正在采集 ${collectProgress?.current ?? 0} / ${collectProgress?.total ?? 0}` : ''}
        </div>
        <button type="button" onClick={() => void handleSmartBatchCollect()} disabled={isCollecting || !hasInputs}
          aria-label={isCollecting ? '正在采集' : '开始采集'}
          title={isCollecting ? '正在采集' : '开始采集（⌘ / Ctrl + Enter）'}
          className="pointer-events-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200/80 disabled:text-slate-400 dark:disabled:bg-white/10 dark:disabled:text-slate-500">
          {isCollecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
