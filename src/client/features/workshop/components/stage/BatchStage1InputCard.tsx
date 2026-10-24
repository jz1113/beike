import { useId, useState } from 'react';
import { ArrowUp, Link2, Loader2 } from 'lucide-react';

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
  const [isFocused, setIsFocused] = useState(false);
  const showActiveEditor = isFocused || Boolean(batchInputText.trim()) || isCollecting || hasInputs;

  return (
    <section
      aria-label="导入商品"
      className="group relative flex min-h-[300px] w-full flex-col justify-between overflow-hidden rounded-[32px] border-2 border-dashed border-slate-300 bg-white/95 text-left shadow-[0_28px_80px_-50px_rgba(15,23,42,.45)] transition hover:border-amber-400 hover:bg-white focus-within:border-amber-400 focus-within:bg-white dark:border-white/10 dark:bg-[#1B1B1E]/95 dark:hover:border-amber-400/60 dark:hover:bg-[#1B1B1E] dark:focus-within:border-amber-400/60 dark:focus-within:bg-[#1B1B1E]"
    >
      {!showActiveEditor && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg transition group-hover:-translate-y-1 group-hover:bg-amber-600 dark:bg-white/10">
            <Link2 className="h-7 w-7" />
          </span>
          <span className="mt-5 text-lg font-black text-slate-900 dark:text-white">
            点击或粘贴商品链接与京东 SKU
          </span>
          <span className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            支持京东、淘宝 / 天猫、1688 商品链接 · 每行一款，单批最多 20 款
          </span>
        </div>
      )}

      <textarea
        rows={6}
        disabled={isCollecting}
        value={batchInputText}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onChange={e => setBatchInputText(e.target.value)}
        onKeyDown={e => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!isCollecting && hasInputs) void handleSmartBatchCollect();
          }
        }}
        placeholder={showActiveEditor ? '粘贴商品链接或京东 SKU（每行一款）：\nhttps://item.jd.com/100279945637.html\n支持京东、淘宝 / 天猫、1688 商品链接，单批最多 20 款' : ''}
        aria-label="商品链接或京东 SKU"
        aria-describedby={statusId}
        spellCheck={false}
        className={`w-full flex-1 resize-none bg-transparent px-8 pt-7 pb-16 text-sm leading-[1.8] text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60 sm:px-9 sm:pt-8 dark:text-slate-100 dark:placeholder:text-slate-500 ${
          showActiveEditor ? 'min-h-[300px] cursor-text' : 'min-h-[300px] cursor-pointer opacity-0'
        }`}
      />

      <div
        className={`pointer-events-none absolute inset-x-8 bottom-6 flex items-center justify-end sm:inset-x-9 sm:bottom-7 ${
          showActiveEditor ? 'opacity-100' : 'sr-only opacity-0'
        }`}
      >
        <div id={statusId} aria-live="polite" className="sr-only">
          {isCollecting ? `正在采集 ${collectProgress?.current ?? 0} / ${collectProgress?.total ?? 0}` : ''}
        </div>
        <button
          type="button"
          onClick={() => void handleSmartBatchCollect()}
          disabled={isCollecting || !hasInputs}
          aria-label={isCollecting ? '正在采集' : '开始采集'}
          title={isCollecting ? '正在采集' : '开始采集（⌘ / Ctrl + Enter）'}
          className="pointer-events-auto inline-flex h-10 gap-2 px-4 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:disabled:bg-white/10 dark:disabled:text-slate-600"
        >
          {isCollecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-4 w-4 stroke-[2.25]" aria-hidden="true" />}
          <span className="text-xs font-semibold">{isCollecting ? '正在采集' : '采集商品'}</span>
        </button>
      </div>
    </section>
  );
}
