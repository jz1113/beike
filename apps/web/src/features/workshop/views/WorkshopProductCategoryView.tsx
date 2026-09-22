import { useCallback, useState } from 'react';
import { ArrowLeft, ChevronRight, FolderTree, Settings2 } from 'lucide-react';
import {
  getSubCategoriesForCategory,
  type ActionCategoryId,
  type SubCategoryDef,
} from '@beike/domain/productCategory';
import SubCategoryManagerModal from '@/features/assets/components/SubCategoryManagerModal';

interface Props {
  onEnterStudio: () => void;
}

type CategoryCard = {
  id: ActionCategoryId;
  icon: string;
  name: string;
  description: string;
};

const PRODUCT_CATEGORIES: CategoryCard[] = [
  { id: 'jewelry', icon: '💍', name: '珠宝首饰', description: '项链、手镯、戒指、耳饰、发饰等' },
  { id: 'digital_3c', icon: '📱', name: '手机数码', description: '手机、耳机、智能手表、平板及游戏数码' },
  { id: 'apparel', icon: '👗', name: '服饰穿搭', description: '上衣、下装、鞋履、箱包与穿搭配饰' },
];

/** 商品品类的唯一入口：管理反推与镜头动作共用的一级、二级类目表。 */
export default function WorkshopProductCategoryView({ onEnterStudio }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<ActionCategoryId | null>(null);
  const [subCategoryCounts, setSubCategoryCounts] = useState<Record<ActionCategoryId, number>>(() => (
    Object.fromEntries(PRODUCT_CATEGORIES.map(({ id }) => [id, getSubCategoriesForCategory(id).length])) as Record<ActionCategoryId, number>
  ));

  const handleCategoriesChanged = useCallback((categoryId: ActionCategoryId, list: SubCategoryDef[]) => {
    setSubCategoryCounts((current) => ({ ...current, [categoryId]: list.length }));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/70 bg-white/55 px-6 py-3.5 backdrop-blur-sm lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onEnterStudio}
            className="flex cursor-pointer items-center gap-1 rounded-lg p-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>返回制作台</span>
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <span className="text-xs font-medium text-slate-500">商品品类设置会同步用于图集反推和提示词资产的镜头动作筛选</span>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 lg:px-8">
        <div className="mb-7 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <FolderTree className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-900">商品类目</h1>
            <p className="mt-1 text-xs leading-5 text-slate-500">选择一级品类后，可维护它的二级类目、适用部位和关键词；保存后会立刻用于智能反推与资产筛选。</p>
          </div>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="商品一级品类画廊">
          {PRODUCT_CATEGORIES.map((category) => {
            const count = subCategoryCounts[category.id];
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                className="group flex min-h-48 cursor-pointer flex-col rounded-2xl border border-white/90 bg-white/80 p-5 text-left shadow-[0_12px_28px_-20px_rgba(15,23,42,0.55)] backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:bg-white/95 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl">{category.icon}</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">{count} 个二级类目</span>
                </div>
                <h2 className="mt-5 text-base font-black text-slate-900">{category.name}</h2>
                <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-500">{category.description}</p>
                <span className="mt-4 flex items-center gap-1 text-xs font-bold text-violet-600 group-hover:text-violet-700">
                  <Settings2 className="h-3.5 w-3.5" />
                  设置二级类目
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </section>
      </main>

      <SubCategoryManagerModal
        isOpen={selectedCategoryId !== null}
        onClose={() => setSelectedCategoryId(null)}
        defaultCategoryId={selectedCategoryId || 'jewelry'}
        onCategoriesChanged={handleCategoriesChanged}
      />
    </div>
  );
}
