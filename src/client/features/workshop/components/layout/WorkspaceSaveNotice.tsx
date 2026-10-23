import { useState } from 'react';

type Props = {
  error: string;
  status: string;
  onRetry: () => Promise<unknown>;
  onDownload: () => void;
  onReload: () => Promise<unknown>;
};

export function WorkspaceSaveNotice({ error, status, onRetry, onDownload, onReload }: Props) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  };
  if (!error) return null;
  const buttonClass = 'rounded-lg bg-white px-2.5 py-1 font-bold text-amber-800 ring-1 ring-amber-200 disabled:opacity-50 dark:bg-[#18191c]';
  return (
    <div role="alert" className="mx-4 sm:mx-6 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <span>{error}{status ? ` · ${status}` : ''}</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={retrying} onClick={() => void retry()} className={buttonClass}>{retrying ? '正在核对…' : '重试保存'}</button>
        <button type="button" onClick={onDownload} className={buttonClass}>下载本地草稿</button>
        <button type="button" onClick={() => void onReload()} className={buttonClass}>重新加载</button>
      </div>
    </div>
  );
}
