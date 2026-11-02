import { Loader2 } from 'lucide-react';

export function SalesWorkflowStatus({
  saveStatus,
  onRetry,
  taskLabel,
}: {
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onRetry?: () => void;
  taskLabel?: string;
}) {
  return (
    <div className="sales-topbar-status">
      {taskLabel ? (
        <span role="status" className="sales-status-pill is-running">
          <Loader2 size={12} className="animate-spin" aria-hidden />
          <span className="max-w-[180px] truncate">{taskLabel}</span>
        </span>
      ) : null}

      {saveStatus === 'saving' ? (
        <span className="sales-status-pill" role="status" title="正在保存草稿…">
          <i className="sales-status-dot is-saving" aria-hidden />
          保存中…
        </span>
      ) : saveStatus === 'error' ? (
        <span className="sales-status-pill is-error">
          <span role="status" className="inline-flex items-center gap-1.5" title="保存失败，当前页面的编辑仍然保留">
            <i className="sales-status-dot is-error" aria-hidden />
            保存失败
          </span>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="sales-status-retry">
              重试保存
            </button>
          ) : null}
        </span>
      ) : saveStatus === 'saved' ? (
        <span className="sales-status-pill" title="当前草稿已自动保存">
          <i className="sales-status-dot is-ok" aria-hidden />
          已自动保存
        </span>
      ) : null}
    </div>
  );
}
