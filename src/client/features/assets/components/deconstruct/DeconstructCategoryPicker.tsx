import type { ProductCategoryOption } from '../../hooks/deconstructQueueOps';
import { topLevelCategories } from '../../model/promptGroupFolders';
import { deconstructSubcategoryOptions } from '../../model/deconstructJobs';

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

  return (
    <>
      <label className="deconstruct-setting-field">
        <span >商品分类</span>
        <select
          aria-label="反推商品大类"
          value={value}
          onChange={event => onChange(event.target.value)}
          disabled={disabled}
          className="deconstruct-setting-select"
        >
          <option value="">自动识别分类</option>
          {majorCategories.map(category => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      <label className="deconstruct-setting-field">
        <span >子文件夹</span>
        <select
          aria-label="反推二级文件夹"
          value={subcategory}
          onChange={event => onSubcategoryChange(event.target.value)}
          disabled={disabled || !value || subcategories.length === 0}
          className="deconstruct-setting-select"
        >
          <option value="">{!value ? '先选择商品大类' : subcategories.length ? '自动匹配' : '暂无二级文件夹'}</option>
          {subcategories.map(folder => <option key={folder.folderId} value={folder.folderId}>{folder.label}</option>)}
        </select>
      </label>
    </>
  );
}
