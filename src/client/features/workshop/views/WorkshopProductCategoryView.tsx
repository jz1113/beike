import { useCallback, useState } from 'react';
import { CategoryMigrationPanel } from '../components/CategoryMigrationPanel';
import { ChevronRight, Settings2 } from 'lucide-react';
import {
  getSubCategoriesForCategory,
  type ActionCategoryId,
  type SubCategoryDef,
} from '@shared/domain/products/productCategory';
import SubCategoryManagerModal from '@client/shared/modals/SubCategoryManagerModal';

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
export default function WorkshopProductCategoryView() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<ActionCategoryId | null>(null);
  const [subCategoryCounts, setSubCategoryCounts] = useState<Record<ActionCategoryId, number>>(() => (
    Object.fromEntries(PRODUCT_CATEGORIES.map(({ id }) => [id, getSubCategoriesForCategory(id).length])) as Record<ActionCategoryId, number>
  ));

  const handleCategoriesChanged = useCallback((categoryId: ActionCategoryId, list: SubCategoryDef[]) => {
    setSubCategoryCounts((current) => ({ ...current, [categoryId]: list.length }));
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent">
      <main className="flex w-full flex-1 flex-col px-5 py-6 sm:px-7 xl:px-8">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-semibold tracking-tight text-slate-800">商品类目</h1>
            <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium text-slate-500">{PRODUCT_CATEGORIES.length}</span>
          </div>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">选择品类，管理二级类目、适用部位与关键词。保存后同步用于智能反推与资产筛选。</p>
        </div>
        <CategoryMigrationPanel />
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="商品一级品类画廊">
          {PRODUCT_CATEGORIES.map((category) => {
            const count = subCategoryCounts[category.id];
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                className="group flex min-h-52 min-w-0 cursor-pointer flex-col rounded-2xl border border-slate-200/60 bg-transparent p-5 text-left transition-colors hover:border-indigo-200/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200/50 bg-transparent text-xl">{category.icon}</span>
                  <span className="rounded-full border border-slate-200/50 bg-transparent px-2.5 py-1 text-[11px] font-medium text-slate-500">{count} 个二级类目</span>
                </div>
                <h2 className="mt-5 text-base font-semibold text-slate-800">{category.name}</h2>
                <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-500">{category.description}</p>
                <span className="mt-5 flex items-center gap-1.5 border-t border-slate-200/40 pt-3 text-xs font-medium text-indigo-600 group-hover:text-indigo-700">
                  <Settings2 className="h-3.5 w-3.5" />
                  设置二级类目
                  <ChevronRight className="ml-auto h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
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
