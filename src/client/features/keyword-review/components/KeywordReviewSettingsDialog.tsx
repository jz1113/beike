import { useEffect, useState } from 'react';
import { RotateCcw, Settings2, X } from 'lucide-react';
import { useKeywordReviewDialog } from '../hooks/useKeywordReviewDialog';
import {
  DEFAULT_KEYWORD_REVIEW_SETTINGS,
  KEYWORD_REVIEW_BATCH_SIZE_OPTIONS,
  KEYWORD_REVIEW_CONCURRENCY_OPTIONS,
  KEYWORD_REVIEW_TRIAL_SIZE_OPTIONS,
  type KeywordReviewSettings,
} from '../model/keywordReviewSettings';

interface Props {
  open: boolean;
  busy: boolean;
  settings: KeywordReviewSettings;
  onClose: () => void;
  onSave: (settings: KeywordReviewSettings) => void;
  onOpenSystemSettings?: () => void;
}

const selectClass = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100 disabled:text-slate-400';

export function KeywordReviewSettingsDialog({ open, busy, settings, onClose, onSave, onOpenSystemSettings }: Props) {
  const [draft, setDraft] = useState(settings);
  const dialogRef = useKeywordReviewDialog(open, onClose);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="keyword-review-settings-title" aria-describedby="keyword-review-settings-description" className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white text-slate-900 shadow-2xl outline-none" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Settings2 className="h-4 w-4" /></span>
            <div>
              <h2 id="keyword-review-settings-title" className="text-base font-black">关键词分类设置</h2>
              <p id="keyword-review-settings-description" className="mt-1 text-xs leading-5 text-slate-500">只影响本模块后续的审核任务，设置保存在当前浏览器。</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭关键词分类设置" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <label className="block">
            <span className="text-sm font-bold text-slate-800">试跑词数</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">点击“试跑”时，从待审核词中取多少条作为样本。当前默认 50 条。</span>
            <select data-dialog-initial-focus aria-label="试跑词数" value={draft.trialSize} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, trialSize: Number(event.target.value) }))} className={selectClass}>
              {KEYWORD_REVIEW_TRIAL_SIZE_OPTIONS.map((count) => <option key={count} value={count}>{count} 条</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-800">每次请求词数</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">每个模型请求最多带多少个词；试跑词数超过此值时会拆成多个顺序请求。接口上限为 60 条。</span>
            <select aria-label="每次请求词数" value={draft.batchSize} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, batchSize: Number(event.target.value) }))} className={selectClass}>
              {KEYWORD_REVIEW_BATCH_SIZE_OPTIONS.map((count) => <option key={count} value={count}>{count} 条</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-800">并发上限</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">同时发送的模型请求上限。成功后会从最多 {Math.min(4, draft.maxConcurrency)} 路逐步提速到此上限；触发限流时自动降速并重试。</span>
            <select aria-label="并发上限" value={draft.maxConcurrency} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, maxConcurrency: Number(event.target.value) }))} className={selectClass}>
              {KEYWORD_REVIEW_CONCURRENCY_OPTIONS.map((count) => <option key={count} value={count}>{count} 路</option>)}
            </select>
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs leading-5 text-slate-600">审核模型在页面顶部切换。API Key 属于账号的全局服务凭据。</p>
            {onOpenSystemSettings && <button type="button" disabled={busy} onClick={onOpenSystemSettings} className="mt-2 text-xs font-bold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-40">前往全局服务设置配置 API Key</button>}
          </div>
          {busy && <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">审核任务已启动或正在运行，结束后可调整设置。</p>}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-6">
          <button type="button" disabled={busy} onClick={() => setDraft(DEFAULT_KEYWORD_REVIEW_SETTINGS)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-white disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />恢复默认</button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-3.5 py-2 text-sm font-bold text-slate-600 transition hover:bg-white">取消</button>
            <button type="button" disabled={busy} onClick={() => onSave(draft)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">保存设置</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
