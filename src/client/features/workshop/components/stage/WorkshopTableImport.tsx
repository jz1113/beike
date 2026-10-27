import { useRef, useState, type DragEvent } from 'react';
import { AlertCircle, ArrowRight, ChevronDown, FileSpreadsheet, Loader2, RefreshCw, UploadCloud } from 'lucide-react';
import type { BatchProductItem } from '../../model/batchTypes';
import { readWorkshopTable } from '../../model/collection/readWorkshopTable';
import { workshopTableAdditionCount, MAX_BATCH_CONTENTS, MAX_IMPORT_PRODUCTS, MAX_PRODUCT_CONTENTS, type WorkshopImportRow } from '../../model/collection/workshopTableImport';

interface Props {
  items: BatchProductItem[];
  disabled: boolean;
  onImport: (rows: WorkshopImportRow[]) => void;
  onCollect?: () => void;
  collectCount?: number;
  onResultChange?: (hasResult: boolean) => void;
}
const control = 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.045] dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40';

export function WorkshopTableImport({ items, disabled, onImport, onCollect, collectCount = 0, onResultChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const readEpoch = useRef(0);
  const [file, setFile] = useState<File>();
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof readWorkshopTable>>>();
  const [error, setError] = useState('');
  const [imported, setImported] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const busy = disabled || reading;
  const load = async (nextFile: File, sheet?: string) => {
    const epoch = ++readEpoch.current;
    setReading(true); setError(''); setResult(undefined); setImported(false); onResultChange?.(false);
    try {
      const next = await readWorkshopTable(nextFile, sheet);
      if (epoch !== readEpoch.current) return;
      setFile(nextFile);
      setResult(next);
      onResultChange?.(true);
      if (next.rows.length === 0) {
        setError('没有可导入的有效商品，请修正表格后重新导入');
        return;
      }
      // Validate the complete import before mutating the current batch. This keeps a
      // failed table from partially adding products when an upper limit is exceeded.
      workshopTableAdditionCount(next.rows, items);
      onImport(next.rows);
      setImported(true);
    } catch (cause) { if (epoch === readEpoch.current) setError(cause instanceof Error ? cause.message : '读取失败'); }
    finally { if (epoch === readEpoch.current) setReading(false); }
  };
  const rows = result?.rows || [];
  const productCount = rows.length;
  const contentCount = rows.reduce((sum, row) => sum + row.count, 0);

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const nextFile = event.dataTransfer.files?.[0];
    if (nextFile) void load(nextFile);
  };

  return <section aria-label="表格导入商品" aria-busy={reading} className={result ? 'overflow-hidden rounded-[24px] border border-slate-200/90 bg-white text-left shadow-[0_20px_60px_-36px_rgba(15,23,42,.45)] dark:border-white/[0.09] dark:bg-[#18191c] dark:shadow-[0_24px_70px_-40px_rgba(0,0,0,.9)]' : 'text-left'}>
    <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="选择商品任务表" disabled={busy} onChange={event => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void load(next); }} />
    {!result && <button
      type="button"
      disabled={busy}
      onClick={() => input.current?.click()}
      onDragOver={(event) => { event.preventDefault(); if (!busy) setIsDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false); }}
      onDrop={handleDrop}
      className={`group flex min-h-[300px] w-full flex-col items-center justify-center rounded-[32px] border-2 border-dashed px-6 py-10 text-center shadow-[0_28px_80px_-50px_rgba(15,23,42,.45)] transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:px-10 ${isDragging
        ? 'border-indigo-500 bg-indigo-50/90 dark:bg-indigo-950/35'
        : 'border-slate-300 bg-white/80 hover:border-indigo-400 hover:bg-white dark:border-white/10 dark:bg-[#1B1B1E]/80 dark:hover:border-indigo-400/60 dark:hover:bg-[#1B1B1E]'}`}
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg transition duration-200 group-hover:-translate-y-1 group-hover:bg-indigo-600 dark:bg-white/10 dark:group-hover:bg-indigo-600">
        {reading ? <Loader2 size={28} className="animate-spin" /> : <UploadCloud size={28} />}
      </span>
      <span className="mt-5 text-lg font-black tracking-[-0.02em] text-slate-900 dark:text-white sm:text-xl">{reading ? '正在读取表格…' : '点击或拖拽上传商品任务表'}</span>
      <span className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">支持 .xlsx、.xls 和 .csv · 表头需含「商品ID / 商品链接」与「需要数量」</span>
    </button>}
    {!result && <details className="group/format mx-auto mt-5 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
      <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg px-3 py-2 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-indigo-500 dark:hover:bg-white/5 dark:hover:text-white [&::-webkit-details-marker]:hidden"><FileSpreadsheet size={14} />查看表格格式与填写说明<ChevronDown size={14} className="transition group-open/format:rotate-180" /></summary>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-white/90 p-4 leading-6 dark:border-white/10 dark:bg-[#1B1B1E]/90 sm:p-5">
        <p>表头包含「商品ID」或「商品链接」与「需要数量」即可，商品名称和类目可选填。商品ID默认按京东 SKU 处理，请设为文本格式。</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead><tr>{['任务类目', '二级类目', '三级类目', '商品名称', '商品ID', '需要数量'].map(label => <th key={label} className="pb-2 pr-4 font-medium text-slate-700 dark:text-slate-200">{label}</th>)}</tr></thead><tbody><tr>{['手机通讯', '手机', '手机', '商品名称', '文本格式的 SKU', '5'].map((value, index) => <td key={index} className="pr-4">{value}</td>)}</tr></tbody></table></div>
        <p className="mt-3 border-t border-slate-100 pt-3 dark:border-white/5">需要数量为 5，即制作 5 条独立图文，每条包含整组配图、标题和正文。每款最多 {MAX_PRODUCT_CONTENTS} 条，单批最多 {MAX_IMPORT_PRODUCTS} 款、{MAX_BATCH_CONTENTS} 条；文件不超过 10 MB。</p>
      </div>
    </details>}
    {result && <div className="border-t border-slate-100 dark:border-white/[0.07]">
      <div className="mx-5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 sm:mx-7 dark:bg-white/[0.045]">
        <div className="flex min-w-0 items-center gap-2">
          <FileSpreadsheet size={15} className="shrink-0 text-indigo-500 dark:text-indigo-300" />
          <span className="max-w-[min(100%,20rem)] truncate text-xs font-semibold text-slate-700 dark:text-slate-200" title={file?.name}>{file?.name}</span>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <select className={`${control} bg-white py-1.5 dark:bg-white/[0.06]`} value={result.sheetName} disabled={busy} aria-label="商品工作表" onChange={event => { if (file) void load(file, event.target.value); }}>{result.sheetNames.map(name => <option key={name}>{name}</option>)}</select>
        </div>
        <button type="button" className={`${control} flex items-center gap-2 font-semibold`} disabled={busy} onClick={() => input.current?.click()}><RefreshCw size={14} />换表</button>
      </div>
      <div className="grid grid-cols-2 gap-3 px-5 pt-3 sm:px-7">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.045]"><p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">商品数量</p><p className="mt-1 text-2xl font-semibold leading-none tabular-nums text-slate-900 dark:text-white">{productCount}<span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">款</span></p></div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3.5 dark:border-indigo-400/15 dark:bg-indigo-400/[0.09]"><p className="text-[11px] font-medium text-indigo-600/80 dark:text-indigo-300/80">需求内容</p><p className="mt-1 text-2xl font-semibold leading-none tabular-nums text-indigo-700 dark:text-indigo-200">{contentCount}<span className="ml-1 text-sm font-normal text-indigo-600/70 dark:text-indigo-300/70">条</span></p></div>
      </div>
      {result.errors.length > 0 && <details className="mx-5 mt-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/[0.08] dark:text-amber-300 sm:mx-7"><summary className="flex cursor-pointer items-center gap-1.5 font-medium"><AlertCircle size={14} />{result.errors.length} 行需要修正，未纳入当前批次</summary><div className="mt-2 max-h-40 overflow-auto space-y-1 pl-5">{result.errors.map(message => <p key={message}>{message}</p>)}</div></details>}
      <div className="mt-4 flex justify-end border-t border-slate-100 px-5 py-4 dark:border-white/[0.07] sm:px-7">
        {onCollect && <button type="button" onClick={onCollect} disabled={busy || !imported || collectCount < 1} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">采集商品图片（{collectCount} 条）<ArrowRight size={14} /></button>}
      </div>
    </div>}
    {error && <p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}
  </section>;
}
