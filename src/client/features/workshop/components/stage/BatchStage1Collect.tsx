import { useState, type Dispatch, type SetStateAction } from 'react';
import { BatchProductItem } from '../../model/batchTypes';
import { BatchStage1InputCard } from './BatchStage1InputCard';
import { WorkshopTableImport } from './WorkshopTableImport';
import type { WorkshopImportRow } from '../../model/collection/workshopTableImport';
import { contentPlanLabel } from '../../model/analysis/workshopContentPlan';
import BatchProgressBar from '../delivery/BatchProgressBar';
import { ArrowRight, FileSpreadsheet, Link2 } from 'lucide-react';

interface Props {
  batchInputText: string;
  setBatchInputText: (val: string) => void;
  items: BatchProductItem[];
  setItems: Dispatch<SetStateAction<BatchProductItem[]>>;
  isCollecting: boolean;
  collectProgress: { total: number; current: number; success: number; failed: number };
  handleParseInput: () => BatchProductItem[];
  handleTableImport: (rows: WorkshopImportRow[]) => void;
  startBatchCollect: (itemsToCollect?: BatchProductItem[], forceRefresh?: boolean) => Promise<void>;
  busy?: boolean;
}

export default function BatchStage1Collect({
  batchInputText, setBatchInputText, items, setItems, isCollecting,
  collectProgress, handleParseInput, handleTableImport, startBatchCollect, busy,
}: Props) {
  const [inputMode, setInputMode] = useState<'table' | 'links'>('table');
  const retryItems = items.filter(item => item.status === 'failed' || item.status === 'pending');
  const hasInputs = Boolean(batchInputText.trim() || retryItems.length > 0);
  const handleSmartBatchCollect = async () => {
    if (busy) return;
    if (batchInputText.trim()) {
      const newItems = handleParseInput();
      if (newItems.length === 0 && retryItems.length === 0) return;
      await startBatchCollect([...newItems, ...retryItems]);
      return;
    }
    await startBatchCollect();
  };
  const collectingInput = items.filter(item => item.status !== 'success').map(item => item.url || item.itemId).join('\n');
  const skippedItems = items.filter(item => !item.selected && item.status === 'success');
  const failedItems = items.filter(item => item.status === 'failed');

  return (
    <section className="w-full pt-4 text-left">
      <h3 className="text-sm font-semibold">添加商品</h3>
      <div data-testid="stage1-input-dock" className="min-w-0">
        <div className="mt-3">
        <div className="mb-3 inline-flex max-w-full items-center rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-white/[0.08] dark:bg-[#1B1B1E]/80" role="group" aria-label="商品导入方式">{([['table', '表格导入', FileSpreadsheet], ['links', '链接添加', Link2]] as const).map(([mode, label, Icon]) => <button key={mode} type="button" disabled={busy || isCollecting} aria-pressed={inputMode === mode} onClick={() => setInputMode(mode)} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5 ${inputMode === mode ? 'bg-white text-slate-950 shadow-sm dark:bg-white/10 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}><Icon size={15} />{label}</button>)}</div>
        <div hidden={inputMode !== 'table'}>
          <WorkshopTableImport items={items} disabled={!!busy || isCollecting} onImport={handleTableImport} />
          {retryItems.length > 0 && <button type="button" disabled={!!busy || isCollecting} onClick={() => void startBatchCollect()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-40 dark:bg-white dark:text-slate-950">采集商品图片（{retryItems.length} 条内容）<ArrowRight size={14} /></button>}
        </div>
        <div hidden={inputMode !== 'links'}><BatchStage1InputCard
          batchInputText={isCollecting ? collectingInput : batchInputText}
          setBatchInputText={setBatchInputText}
          isCollecting={isCollecting}
          hasInputs={hasInputs && !busy}
          handleSmartBatchCollect={handleSmartBatchCollect}
        /></div>
        </div>
        {retryItems.length > 0 && <details className="workshop-pending-list">
          <summary>待采集与重试 · {retryItems.length} 条</summary>
          <ul>{retryItems.map(item => <li key={item.id}><strong>{item.title || item.itemId}</strong>
            <small>{contentPlanLabel(item) || item.itemId} · {item.status === 'failed' ? '采集失败' : '待采集'}</small></li>)}</ul>
        </details>}
        {isCollecting && <div className="mt-4 rounded-2xl border border-slate-200 bg-white/95 p-4 dark:border-white/10 dark:bg-[#18191c]/95"><BatchProgressBar current={collectProgress.current} total={collectProgress.total} label={`正在采集 · 成功 ${collectProgress.success} 条 · 失败 ${collectProgress.failed} 条`} showSpinner /></div>}
        {skippedItems.length > 0 && <details className="mt-3 rounded-lg border p-3 text-left text-sm">
          <summary className="cursor-pointer">本批已跳过 {skippedItems.length} 条图文</summary>
          <ul className="mt-2 max-h-48 overflow-auto">{skippedItems.map(item => <li key={item.id} className="flex items-center justify-between gap-2 py-1">
            <span>{item.title || item.itemId} {contentPlanLabel(item)}</span>
            <button type="button" disabled={busy} className="shrink-0 underline" onClick={() => setItems(rows => rows.map(row => row.id === item.id ? { ...row, selected: true } : row))}>恢复制作</button>
          </li>)}</ul>
        </details>}
        {!isCollecting && failedItems.length > 0 && (
          <div role="alert" className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs leading-6 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="min-w-0 flex-1 space-y-1">
              {failedItems.map(item => <p key={item.id} className="break-all">{item.itemId}：{item.errorMsg || '采集失败，请重试'}</p>)}
              <p>点击采集按钮重试，或检查商品链接。</p>
            </div>
              <button disabled={busy}
                type="button"
                onClick={() => setItems(prev => prev.filter(item => item.status !== 'failed'))}
                className="shrink-0 rounded-lg px-2.5 py-1 font-medium text-amber-800 transition-colors hover:bg-amber-500/15 dark:text-amber-200"
              >
                清除失败项
              </button>
          </div>
        )}
      </div>
    </section>
  );
}
