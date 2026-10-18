import type { ProductCategoryOption } from '../hooks/deconstructQueueOps';
import { topLevelCategories } from '../model/promptGroupCategory';
import { deconstructSubcategoryOptions } from '../model/deconstructImportTarget';

export function DeconstructCategoryPicker({
  value,
  onChange,
  subcategory,
  onSubcategoryChange,
  categories = [],
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  subcategory: string;
  onSubcategoryChange: (value: string) => void;
  categories?: ProductCategoryOption[];
  disabled: boolean;
}) {
  const majorCategories = topLevelCategories(categories)
    .sort((a, b) => a.position - b.position);
  const subcategories = deconstructSubcategoryOptions(value, categories);
  const controlClass = 'flex min-w-0 flex-col gap-1.5';
  const selectClass = 'h-10 w-full min-w-0 cursor-pointer rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-400 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]';

  return (
    <>
      <label className={controlClass}>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">归档大类</span>
        <select
          aria-label="反推商品大类"
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          className={selectClass}
        >
          <option value="">自动识别（无法判断则待分类）</option>
          {majorCategories.map(category => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      <label className={controlClass}>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">子文件夹</span>
        <select
          aria-label="反推二级文件夹"
          value={subcategory}
          onChange={event => onSubcategoryChange(event.target.value)}
          disabled={disabled || !value || subcategories.length === 0}
          className={selectClass}
        >
          <option value="">{!value ? '先选择商品大类' : subcategories.length ? '自动匹配' : '暂无二级文件夹'}</option>
          {subcategories.map(folder => <option key={folder.folderId} value={folder.folderId}>{folder.label}</option>)}
        </select>
      </label>
    </>
  );
}
