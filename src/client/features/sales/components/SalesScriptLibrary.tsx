import { useMemo, useState } from 'react';
import { Layers, MoreHorizontal, Plus, RefreshCw, Search, Settings2, Sparkles, X } from 'lucide-react';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import type { StoredSalesScript } from '../api/salesScripts';
import type { SalesMaterialCard } from '../model/salesMaterialCatalog';
import type { ScriptCategoryFilter } from '../model/salesScriptLibrary';
import { salesReferenceLibraryView } from '../model/salesReferenceLibrary';
import { SalesScriptCard } from './SalesScriptCard';
import { SalesActionCard } from './SalesActionCard';
import { SalesScriptCategorySidebar } from './SalesScriptCategorySidebar';
import { SalesMaterialActionCategoryTree } from './SalesMaterialActionCategoryTree';
import { SalesMaterialSidebar } from './SalesMaterialSidebar';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import '../salesMaterial.css';
import '../salesReferenceLibrary.css';

interface Props {
  embedded?: boolean;
  actionCards?: readonly SalesMaterialCard[];
  actionBusy?: boolean;
  onReviewAction?: (card: SalesMaterialCard) => void;
  onDeleteAction?: (card: SalesMaterialCard) => void;
  onLinkAction?: (card: SalesMaterialCard) => void;
  onOpenDepth?: () => void;
  onUploadDepth?: () => void;
  onOpenAtlas?: () => void;
  items: StoredSalesScript[];
  loading: boolean;
  loadError?: string;
  taxonomyItems: readonly ScriptTaxonomyItem[];
  taxonomyLoading: boolean;
  taxonomyBusy?: boolean;
  onManageTaxonomy: (kind: ScriptTaxonomyKind) => void;
  onCreateTaxonomy?: (kind: ScriptTaxonomyKind, name: string) => Promise<ScriptTaxonomyItem | null>;
  onRenameTaxonomy?: (id: string, name: string) => Promise<boolean>;
  onRemoveTaxonomy?: (item: ScriptTaxonomyItem) => Promise<boolean>;
  onReview: (item: StoredSalesScript) => void;
  onArchive: (id: string) => void | boolean | Promise<boolean>;
  onDelete: (id: string) => void | boolean | Promise<boolean>;
  onRefresh: () => void;
  onOpenImport?: () => void;
  onQuickClassify?: (item: StoredSalesScript, categoryId: string, styleId: string) => Promise<boolean>;
}

export function SalesScriptLibrary({
  embedded = false, items, loading, loadError = '', taxonomyItems, taxonomyLoading, taxonomyBusy = false,
  onManageTaxonomy, onCreateTaxonomy, onRenameTaxonomy, onRemoveTaxonomy,
  onReview, onArchive, onDelete, onRefresh, onOpenImport, onQuickClassify,
  actionCards = [], actionBusy = false, onReviewAction, onDeleteAction, onLinkAction, onOpenDepth, onUploadDepth, onOpenAtlas,
}: Props) {
  const [categoryChoice, setCategory] = useState<ScriptCategoryFilter>('all');
  const [styleChoice, setStyle] = useState('all');
  const [query, setQuery] = useState('');
  const categories = taxonomyItems.filter((item) => item.kind === 'category');
  const styles = taxonomyItems.filter((item) => item.kind === 'style');
  const category = categoryChoice.startsWith('category:') && !categories.some((item) => `category:${item.id}` === categoryChoice) ? 'all' : categoryChoice;
  const style = styleChoice !== 'all' && !styles.some((item) => item.id === styleChoice) ? 'all' : styleChoice;
  const view = useMemo(() => salesReferenceLibraryView(items, actionCards, taxonomyItems, { category, style, query }),
    [items, actionCards, taxonomyItems, category, style, query]);
  const { entries, total, count } = view;
  const filtered = category !== 'all' || style !== 'all' || Boolean(query.trim());
  const reset = () => { setCategory('all'); setStyle('all'); setQuery(''); };
  const categoryDisabled = taxonomyLoading || loading || taxonomyBusy;

  return <section className={`sales-library-shell sales-script-library ${embedded ? 'is-embedded' : ''}`} aria-label="动作素材库">
    {embedded && <SalesMaterialSidebar><SalesMaterialActionCategoryTree categories={categories} actionCards={actionCards}
      filterOptions={view.categories}
      activeFilter={category === 'uncategorized' ? 'unclassified' : category === 'draft_only' ? 'all' : category}
      loading={taxonomyLoading || loading} busy={taxonomyBusy}
      onSelectFilter={(value) => setCategory(value === 'unclassified' ? 'uncategorized' : value)}
      onRenameCategory={onRenameTaxonomy} onRemoveCategory={onRemoveTaxonomy} /></SalesMaterialSidebar>}
    {!embedded && <SalesScriptCategorySidebar items={items} activeCategory={category} taxonomyItems={taxonomyItems}
      loading={taxonomyLoading} busy={taxonomyBusy} onManage={() => onManageTaxonomy('category')}
      onCreateCategory={onCreateTaxonomy ? (name) => onCreateTaxonomy('category', name) : undefined}
      onRenameCategory={onRenameTaxonomy} onRemoveCategory={onRemoveTaxonomy} onSelectCategory={setCategory} />}
    <div className="sales-library-main">
      <div className="sales-library-top">
        <div className="sales-asset-toolbar">
          <div className="sales-asset-filter-controls" role="group" aria-label="筛选动作素材">
            <SalesLibrarySelect label="按风格筛选" value={style} active={style !== 'all'} disabled={taxonomyLoading}
              showSelectedCount={false} countUnit="组" onChange={setStyle} options={view.styles} searchable />
            <button type="button" disabled={categoryDisabled} aria-label="管理分类与风格" onClick={() => onManageTaxonomy('category')} className={salesGhostButtonClass}><Settings2 size={14} aria-hidden />管理分类与风格</button>
            {onOpenAtlas && <button type="button" onClick={onOpenAtlas} className={`${salesGhostButtonClass} border-indigo-500/30 text-indigo-600 dark:text-indigo-300`}><Sparkles size={14} />姿态图鉴库</button>}
            {onOpenDepth && <details className="sales-reference-tools"><summary aria-label="更多素材操作" className={salesGhostButtonClass}><MoreHorizontal size={16} /></summary>
              <div><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onOpenDepth(); }} className={salesGhostButtonClass}><Layers size={13} />单独转换图片 / 视频</button>
                {onUploadDepth && <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); onUploadDepth(); }} className={salesGhostButtonClass}><Plus size={13} />上传已有深度素材</button>}</div></details>}
          </div>
          <div className="sales-asset-search-tools"><label className="sales-script-search"><Search size={13} aria-hidden />
            <input aria-label="搜索动作素材" placeholder="搜索名称、分类或风格…" value={query} onChange={(event) => setQuery(event.target.value)} />
            {query && <button type="button" aria-label="清空动作素材搜索" onClick={() => setQuery('')} className={salesFocusClass}><X size={13} /></button>}
          </label><button type="button" disabled={loading} onClick={onRefresh} aria-label="刷新素材库" className={salesGhostButtonClass}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /></button></div>
        </div>
        {filtered && <div className="sales-reference-active-filters" aria-label="已选筛选条件">
          <span>已筛选</span>
          {category !== 'all' && <button type="button" onClick={() => setCategory('all')} aria-label="移除素材分类筛选">{category === 'uncategorized' ? '未分类' : category === 'draft_only' ? '待核对' : categories.find((item) => `category:${item.id}` === category)?.name}<X size={12} /></button>}
          {style !== 'all' && <button type="button" onClick={() => setStyle('all')} aria-label="移除素材风格筛选">{view.styles.find((item) => item.value === style)?.label}<X size={12} /></button>}
          {query.trim() && <button type="button" onClick={() => setQuery('')} aria-label="移除搜索条件">搜索：{query.trim()}<X size={12} /></button>}
          <button type="button" onClick={reset} className="sales-reference-clear">清除全部</button>
        </div>}
        {loadError && total > 0 && <p role="alert" className="sales-material-error">刷新失败，当前显示上次加载的素材。<button type="button" disabled={loading} onClick={onRefresh} className={salesFocusClass}>重试</button></p>}
      </div>
      <div className="sales-library-scroll" aria-busy={loading}>
        {loading && !total ? <div className="sales-library-empty-state" role="status"><RefreshCw size={22} className="animate-spin" /><h3>正在读取素材…</h3></div>
          : loadError && !total ? <div className="sales-library-empty-state"><h3>暂时无法读取动作素材</h3><p>请重试加载素材库。</p><button type="button" onClick={onRefresh} className={salesGhostButtonClass}><RefreshCw size={15} />重新加载</button></div>
          : <>
            {!count && filtered && <div className="sales-asset-empty-notice" role="status">
              <div><strong>没有符合筛选条件的素材</strong><p>库中共有 {total} 组素材，可清除筛选后查看。</p></div>
              <button type="button" onClick={reset} className={salesGhostButtonClass}>清除全部筛选</button></div>}
            <div className="sales-script-grid sales-reference-grid">
              {entries.map((entry) => entry.kind === 'script' ? <SalesScriptCard key={`script:${entry.item.id}`} item={entry.item} taxonomyItems={taxonomyItems} taxonomyLoading={taxonomyLoading}
                onManageTaxonomy={onManageTaxonomy} onCreateTaxonomy={onCreateTaxonomy} onQuickClassify={onQuickClassify}
                onReview={onReview} onArchive={onArchive} onDelete={onDelete} />
                : <SalesActionCard key={`action:${entry.item.key}`} card={entry.item} disabled={actionBusy}
                  onReview={() => onReviewAction?.(entry.item)} onDelete={() => onDeleteAction?.(entry.item)}
                  onLink={entry.item.video && entry.item.mediaType === 'depth-video' && onLinkAction ? () => onLinkAction(entry.item) : undefined} />)}
              {onOpenImport && <button type="button" onClick={onOpenImport} className={`sales-reference-add-card ${salesFocusClass}`}>
                <Plus size={22} aria-hidden /><strong>上传参考视频</strong><small>保存脚本与深度动作视频</small>
              </button>}
            </div>
          </>}
      </div>
    </div>
  </section>;
}
