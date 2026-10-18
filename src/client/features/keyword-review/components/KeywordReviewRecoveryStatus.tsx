import { useState } from 'react';
import { AlertCircle, Check, Loader2, RefreshCcw } from 'lucide-react';
import { KeywordReviewClearRecoveryDialog } from './KeywordReviewClearRecoveryDialog';

interface Props {
  saving: boolean;
  savedAt: number | null;
  error: string;
  onRetry: () => void;
  hasTask?: boolean;
  disableRetry?: boolean;
  onDiscard?: () => Promise<boolean>;
}

export function KeywordReviewRecoveryStatus({ saving, savedAt, error, onRetry, hasTask = true, disableRetry = false, onDiscard }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  if (error) return (
    <>
    <div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
      <div className="flex flex-wrap items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words">{hasTask ? '本机自动保存未完成，刷新前请导出进度。' : '本机进度暂不可用，请重试后继续。'}{error}</p>
        <button type="button" disabled={saving || disableRetry} onClick={onRetry} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-bold hover:bg-amber-100 disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />}{saving ? '正在重试…' : hasTask ? '重试保存' : '重新读取'}</button>
        {onDiscard && <button type="button" disabled={saving || disableRetry} onClick={() => setConfirmClear(true)} className="shrink-0 rounded-lg px-2 py-1 font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">清除本机记录</button>}
      </div>
    </div>
    {confirmClear && onDiscard && <KeywordReviewClearRecoveryDialog onClose={() => setConfirmClear(false)} onClear={onDiscard} />}
    </>
  );
  if (!saving && savedAt === null) return null;
  return (
    <p role="status" aria-live="polite" className="mt-2 flex items-center gap-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
      {saving ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />}
      {saving ? '正在保存至本机…' : `已保存至本机 · ${new Date(savedAt!).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`}
    </p>
  );
}
