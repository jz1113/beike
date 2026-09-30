import { useState } from 'react';
import { CheckCircle2, ChevronRight, Settings2, X } from 'lucide-react';
import type { BatchProductItem, MasterRecipe } from '../model/batchTypes';

interface BatchArchitectureConfirmDialogProps {
  isOpen: boolean;
  recipes: MasterRecipe[];
  selectedArchId: string;
  onCancel: () => void;
  onConfirm: (architectureId: string) => void;
  products: BatchProductItem[];
}

/**
 * The global production setting is only a default. This dialog makes the
 * architecture an explicit choice for the batch immediately before analysis.
 */
export function BatchArchitectureConfirmDialog({
  isOpen,
  recipes,
  selectedArchId,
  onCancel,
  onConfirm,
  products,
}: BatchArchitectureConfirmDialogProps) {
  // A persisted production preset is not an approval for this batch. Start at
  // an empty draft so even a matching default still needs an explicit choice.
  const [batchArchId, setBatchArchId] = useState('');
  if (!isOpen) return null;

  const isAutoSelection = batchArchId === 'auto' && recipes.length > 0;
  const selectedRecipe = recipes.find((recipe) => recipe.id === batchArchId);
  const defaultRecipe = recipes.find((recipe) => recipe.id === selectedArchId);
  const prices = products.map((product) => product.price).filter((price) => Number.isFinite(price) && price > 0);
  const priceSummary = prices.length ? `¥${Math.min(...prices)} – ¥${Math.max(...prices)}` : '价格待采集';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[2px] animate-in fade-in duration-200">
      <button type="button" aria-label="返回选图" className="absolute inset-0 cursor-default" onClick={onCancel} />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-architecture-confirm-title"
        className="relative z-10 w-full max-w-xl overflow-hidden rounded-[20px] border border-slate-200 bg-white text-slate-900 shadow-[0_24px_64px_-28px_rgba(15,23,42,0.45)] animate-in zoom-in-95 duration-200"
      >
        <header className="flex items-start justify-between gap-5 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 ring-1 ring-indigo-100">
              <Settings2 className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <h2 id="batch-architecture-confirm-title" className="text-sm font-black tracking-tight">确认本批次类目拍摄架构</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">拍摄架构约束商品展示与提示词规则；四图母本仍按商品匹配或在生产设置中指定。</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="返回选图">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600">本批次 {products.length} 款商品</span>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600">采集价格 {priceSummary}</span>
            {selectedArchId === 'auto' || defaultRecipe ? <span className="rounded-lg bg-amber-50 px-2.5 py-1 font-bold text-amber-700">当前全局默认：{selectedArchId === 'auto' ? '自动按商品类目匹配' : defaultRecipe?.name}</span> : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="batch-architecture-select" className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>类目拍摄架构</span>
              <span className="font-normal text-slate-400">约束商品展示与提示词规则</span>
            </label>
            <select
              id="batch-architecture-select"
              value={batchArchId}
              onChange={(event) => setBatchArchId(event.target.value)}
              className="w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="" disabled>请选择类目拍摄架构</option>
              {recipes.length > 0 && <option value="auto">自动按商品类目匹配（逐款）</option>}
              {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
            </select>
            <p className="text-[11px] leading-5 text-slate-500">手机通讯架构适用于手机和配件；是否为手机本体仍根据商品信息判断。</p>
          </div>

          {isAutoSelection ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-xs font-black text-indigo-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                已选择：逐款自动匹配
              </div>
              <p className="mt-1.5 text-xs leading-5 text-slate-600">珠宝使用珠宝架构，手机数码使用手机架构；没有相符架构的商品会停止分析并提示处理。</p>
            </div>
          ) : selectedRecipe ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-xs font-black text-indigo-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                已选择：{selectedRecipe.name}
              </div>
              {selectedRecipe.promptSnippet ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">{selectedRecipe.promptSnippet}</p> : null}
            </div>
          ) : (
            <p role="alert" className="rounded-xl bg-amber-50 px-3.5 py-3 text-xs font-medium leading-5 text-amber-800">请选择一个有效的类目拍摄架构，才能开始提示词分析。</p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3.5 sm:px-6">
          <button type="button" onClick={onCancel} className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100">返回选图</button>
          <button
            type="button"
            disabled={!selectedRecipe && !isAutoSelection}
            onClick={() => onConfirm(batchArchId)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            确认架构，开始分析
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </footer>
      </section>
    </div>
  );
}
