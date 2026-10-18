import { Trash2 } from 'lucide-react';
import { ReEditIcon, RegenerateIcon } from '@client/shared/icons';

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

const iconButtonClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200 cursor-pointer';

/**
 * 生成结果下方的纯图标操作：重新编辑、再次生成、删除。
 * 尺寸与悬停对齐对话回答操作，删除悬停变红。
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
    <div className="inline-flex w-max flex-nowrap items-center gap-1 select-none">
      {hasFailed && (
        <button
          type="button"
          onClick={onClearFailed}
          className="mr-1 inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-400/10 cursor-pointer"
          title={`清除本批次中的 ${failedCount} 个失败卡片`}
        >
          <Trash2 className="h-3.5 w-3.5 shrink-0" />
          <span>清除失败 ({failedCount})</span>
        </button>
      )}

      <button
        type="button"
        onClick={onReuse}
        className={iconButtonClass}
        title={reEditTitle}
        aria-label={reEditTitle}
      >
        <ReEditIcon className="h-3.5 w-3.5 shrink-0" />
      </button>

      <button
        type="button"
        onClick={onRegenerate}
        className={iconButtonClass}
        title={regenerateTitle}
        aria-label={regenerateTitle}
      >
        <RegenerateIcon className="h-3.5 w-3.5 shrink-0" />
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-400/10 dark:hover:text-rose-300 cursor-pointer"
        title={deleteText}
        aria-label={deleteText}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
