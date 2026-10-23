import type { AssetLibrarySlim } from '@shared/domain/assets/assetLibraryTypes';
import type { AssetProductCategory, PromptAlbum } from '@shared/domain/assets/assetOrganization';
import { promptGroupSubcategoryOptions, recognizedPromptGroupSubcategory } from '../../model/promptGroupFolders';
import { promptGroupCategoryKey, topLevelCategories } from '../../model/promptGroupFolders';

export function PromptGroupCategoryEditor({
  item,
  categories,
  albums,
  onCategoryChange,
  onSubcategoryChange,
}: {
  item: AssetLibrarySlim;
  categories: AssetProductCategory[];
  albums: PromptAlbum[];
  onCategoryChange: (value: string) => void;
  onSubcategoryChange: (value: string | null) => void;
}) {
  // 编辑草稿的显式 [] 代表“待分类”；旧图集兜底只用于字段缺失的记录。
  const storedCategory = promptGroupCategoryKey(
    item,
    categories,
    typeof item.productCategoryIds === 'string' ? [] : albums,
  );
  const selectedCategory = storedCategory === 'universal' ? 'unclassified' : storedCategory;
  const subcategoryOptions = promptGroupSubcategoryOptions(categories, selectedCategory);

  return <>
    <div>
      <label htmlFor="full-prompt-product-category" className="mb-1 block font-bold text-slate-700 dark:text-slate-200">商品大类：</label>
      <select
        id="full-prompt-product-category"
        value={selectedCategory}
        onChange={(event) => onCategoryChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 dark:text-slate-100 dark:bg-white/5 dark:border-white/10"
      >
        <option value="unclassified">待分类</option>
        {topLevelCategories(categories).map((category) => (
          <option key={category.id} value={category.id}>{category.name}</option>
        ))}
      </select>
      <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">同一图集的图组保持一致；切换大类会清除原有商品细分。</p>
    </div>
    {selectedCategory !== 'unclassified' && <div>
      <label htmlFor="full-prompt-product-subcategory" className="mb-1 block font-bold text-slate-700 dark:text-slate-200">商品细分：</label>
      <select
        id="full-prompt-product-subcategory"
        value={recognizedPromptGroupSubcategory(item.productSubcategory, categories, selectedCategory) || ''}
        onChange={(event) => onSubcategoryChange(event.target.value || null)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500 dark:text-slate-100 dark:bg-white/5 dark:border-white/10"
      >
        <option value="">待确认细分</option>
        {subcategoryOptions.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
      <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">可在对应商品大类中新建、重命名细分文件夹。手机壳等配件请勿选“手机本体”。</p>
    </div>}
  </>;
}
