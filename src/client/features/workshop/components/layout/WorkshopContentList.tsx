import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import { contentPlanLabel } from '../../model/analysis/workshopContentPlan';
import type { BatchProductItem } from '../../model/batchTypes';

export function WorkshopContentList({ label, items, currentId, onSelect, status }: {
  label: string; items: BatchProductItem[]; currentId?: string;
  onSelect: (id: string) => void; status: (item: BatchProductItem) => string;
}) {
  return <nav aria-label={label} className="workshop-content-list">
    <h3>{label}<small>{items.length} 条</small></h3>
    <div className="workshop-list-rows">
      {items.map(item => {
        const cover = item.selectedProductImages[0] || item.coverImage;
        return <button key={item.id} type="button" title={item.title || item.itemId}
          onClick={() => onSelect(item.id)} aria-current={item.id === currentId ? 'true' : undefined}>
          <span className="workshop-row-thumb">{cover && <LazyProxyImage src={cover} alt="" thumb width={80} className="!object-contain" />}</span>
          <span className="min-w-0 flex-1"><strong>{item.title || item.itemId}</strong>
            <small>{contentPlanLabel(item) || item.itemId}</small><small>{status(item)}</small></span>
        </button>;
      })}
      {!items.length && <p className="p-2 text-xs">当前筛选下没有图文。</p>}
    </div>
  </nav>;
}
