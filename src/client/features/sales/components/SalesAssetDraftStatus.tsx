import type { SalesAssetDraftStatus as DraftStatus } from '../hooks/useSalesAssetDraft';
import { salesFocusClass } from './salesChrome';

export function SalesAssetDraftStatus({ status, existing, busy, pending, readOnly = false, onDiscard }: {
  status: DraftStatus; existing: boolean; busy: boolean; pending: boolean; readOnly?: boolean; onDiscard: () => void;
}) {
  const hasDraft = !readOnly && status !== 'idle';
  const text = pending ? '正在保存到资产库…'
    : readOnly || status === 'idle' ? existing ? '已入库' : '尚未入库'
      : status === 'error' ? '草稿暂存失败'
        : `${status === 'restored' ? '已恢复草稿' : '草稿已暂存'} · ${existing ? '修改待保存' : '未入库'}`;
  return <div className="sales-asset-draft-status">
    <span role="status">{text}</span>
    {hasDraft && <button type="button" disabled={busy} className={salesFocusClass} onClick={onDiscard}>放弃草稿</button>}
  </div>;
}
