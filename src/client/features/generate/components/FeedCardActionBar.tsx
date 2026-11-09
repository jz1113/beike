import { Trash2 } from 'lucide-react';
import { ReEditIcon, RegenerateIcon } from '@client/shared/icons/actions/ActionIcons';

export interface FeedCardActionBarProps {
  onReuse: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  deleteText?: string;
  regenerateTitle?: string;
  reEditTitle?: string;
  failedCount?: number;
  onClearFailed?: () => void;
}

const actionButtonClass =
  'inline-flex min-h-9 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200 cursor-pointer';

/**
 * 生成结果操作以图标与文字说明用途，删除与常用操作分隔。
 */
export default function FeedCardActionBar({
  onReuse,
  onRegenerate,
  onDelete,
  deleteText = '删除该批次结果',
  regenerateTitle = '再次生成',
  reEditTitle = '重新编辑提示词与参数',
  failedCount = 0,
  onClearFailed,
}: FeedCardActionBarProps) {
  const hasFailed = failedCount > 0 && typeof onClearFailed === 'function';

  return (
    <div className="flex w-full flex-wrap items-center gap-1 select-none">
      {hasFailed && (
        <button
          type="button"
          onClick={onClearFailed}
          className="mr-1 inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-slate-500 transition-colors hover:bg-rose-50 dark:text-slate-400 dark:hover:bg-rose-400/10 cursor-pointer"
          title={`清除本批次中的 ${failedCount} 个失败卡片`}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span>清除失败 ({failedCount})</span>
        </button>
      )}

      <button
        type="button"
        onClick={onReuse}
        className={actionButtonClass}
        title={reEditTitle}
        aria-label={reEditTitle}
      >
        <ReEditIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span>编辑提示词</span>
      </button>

      <button
        type="button"
        onClick={onRegenerate}
        className={actionButtonClass}
        title={regenerateTitle}
        aria-label={regenerateTitle}
      >
        <RegenerateIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span>再次生成</span>
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="ml-1 inline-flex min-h-9 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-400/10 dark:hover:text-rose-300 cursor-pointer"
        title={deleteText}
        aria-label={deleteText}
      >
        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
        <span>删除结果</span>
      </button>
    </div>
  );
}
