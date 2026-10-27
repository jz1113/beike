import { CheckCheck, FolderInput, Trash2, X } from 'lucide-react';

export function AssetLibrarySelectionBar({ count, total, itemLabel, allSelected, canMove, busy, onSelectAll, onMove, onDelete, onClose }: {
  count: number;
  total: number;
  itemLabel: string;
  allSelected: boolean;
  canMove: boolean;
  busy: boolean;
  onSelectAll: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return <div className="asset-selection-bar" role="toolbar" aria-label="批量管理素材">
    <div className="asset-selection-status">
      <span className="asset-selection-status-mark" aria-hidden="true"><CheckCheck size={15} /></span>
      <span role="status" aria-live="polite">
        <strong>{count}</strong><span className="asset-selection-count-separator">/</span>{total} {itemLabel}
      </span>
      <span className="asset-selection-status-label">批量选择</span>
    </div>
    <button type="button" disabled={busy || !total} onClick={onSelectAll} className="asset-selection-select-all">
      <CheckCheck size={14} />{allSelected ? '取消全选' : '全选当前结果'}
    </button>
    <div className="asset-selection-actions">
      {canMove && <button type="button" disabled={busy || !count} onClick={onMove}><FolderInput size={14} />移动到分类</button>}
      <button type="button" disabled={busy || !count} onClick={onDelete} className="asset-selection-delete"><Trash2 size={14} />删除</button>
      <button type="button" disabled={busy} onClick={onClose} className="asset-selection-close"><X size={14} />退出批量</button>
    </div>
  </div>;
}
