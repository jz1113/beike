import { useState } from 'react';
import { Check, ImagePlus } from 'lucide-react';
import BatchImageSelectionPanel from '../product/BatchImageSelectionPanel';
import BatchStageFooter from './BatchStageFooter';
import { useBatchConfig } from '../settings/BatchConfigContext';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

export default function BatchStage2Config() {
  const config = useBatchConfig();
  const { successfulItems, analysisIssue, busy } = config;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const completedItems = successfulItems.filter(item => item.selectedProductImages.some(url => url.trim()));
  const pendingItems = successfulItems.filter(item => !item.selectedProductImages.some(url => url.trim()));
  const displayedItems = productFilter === 'pending' ? pendingItems : productFilter === 'completed' ? completedItems : successfulItems;
  const focusedIndex = Math.max(0, displayedItems.findIndex(item => item.id === focusedId));
  const setFocusedIndex = (action: number | ((previous: number) => number)) => {
    const index = typeof action === 'function' ? action(focusedIndex) : action;
    setFocusedId(displayedItems[index]?.id || null);
  };
  const allImagesReady = successfulItems.length > 0 && pendingItems.length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">确认商品图与生产配置</h1>
          <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">每款至少选 1 张；首张作为商品身份锚图，其余图片补充外观细节。参考母本和模型可在上方调整。</p></div>
        <span className="text-xs text-slate-500 dark:text-slate-400">已选图 <b className="text-indigo-600 dark:text-indigo-300">{completedItems.length}/{successfulItems.length}</b> 款</span>
      </div>
      <div className="grid min-h-[440px] flex-1 gap-3 lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside aria-label="待选图商品列表" className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-3 dark:border-white/10 dark:bg-[#18191c]/95">
          <div role="group" aria-label="选图状态筛选" className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-[11px] dark:bg-white/5">
            {([['all', '全部', successfulItems.length], ['pending', '待选', pendingItems.length], ['completed', '已选', completedItems.length]] as const).map(([value, label, count]) => <button key={value} type="button" aria-pressed={productFilter === value}
              onClick={() => { setProductFilter(value); setFocusedId(null); }} className={`flex-1 rounded-md px-1.5 py-1.5 ${productFilter === value ? 'bg-white font-semibold text-slate-800 shadow-sm dark:bg-white/10 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{label} {count}</button>)}
          </div>
          <div className="flex max-h-40 gap-2 overflow-auto lg:max-h-[520px] lg:flex-1 lg:flex-col">
            {displayedItems.map((item, index) => <button key={item.id} type="button" onClick={() => setFocusedId(item.id)} aria-current={index === focusedIndex ? 'true' : undefined}
              className={`flex min-w-[160px] items-center gap-2.5 rounded-xl p-2 text-left lg:min-w-0 ${index === focusedIndex ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-500/15 dark:ring-indigo-400/30' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}>
              <img src={proxyMediaUrl(item.coverImage || item.allTypedImages[0]?.url || '', { thumb: true, width: 80 })} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain" loading="lazy" />
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={item.title}>{successfulItems.indexOf(item) + 1}. {item.title}</span>
                <span className={`mt-1 flex items-center gap-1 text-[11px] ${item.selectedProductImages.length ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {item.selectedProductImages.length ? <Check className="h-3 w-3" /> : <ImagePlus className="h-3 w-3" />}{item.selectedProductImages.length ? `已选 ${item.selectedProductImages.length} 张` : '待选择商品图'}
                </span></span>
            </button>)}
            {displayedItems.length === 0 && <p className="px-2 py-5 text-xs text-slate-400">{productFilter === 'pending' ? '所有商品都已选图' : '此筛选下暂无商品'}</p>}
          </div>
        </aside>
        <BatchImageSelectionPanel displayedItems={displayedItems} focusedIndex={focusedIndex}
          activeImgFilter={config.activeImgFilter} onFilterChange={config.setActiveImgFilter}
          setFocusedIndex={setFocusedIndex} setItems={config.setItems} onToggleImage={config.toggleProductImageSelection}
          batchSetProductImages={config.batchSetProductImages} handleRemoveItem={config.handleRemoveItem}
          onPreviewGallery={config.onPreviewGallery} onPreviewImage={config.onPreviewImage} />
      </div>
      {analysisIssue && allImagesReady && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200">{analysisIssue}。请打开生产设置检查，或前往「素材与技能」补充素材。</p>}
      <BatchStageFooter onPrev={config.onPrevStage} prevLabel="返回添加商品" prevDisabled={busy}
        hint={<span className="text-xs text-slate-500 dark:text-slate-400">{pendingItems.length ? `还有 ${pendingItems.length} 款未选图` : '选图已齐，下一步生成并确认分镜'}</span>}
        primaryAction={{ label: '确认选图，分析分镜', onClick: config.onNextStage, disabled: busy || !allImagesReady || Boolean(analysisIssue) }} />
    </section>
  );
}
