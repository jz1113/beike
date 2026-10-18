import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { filterPromptGroupsByFolder, type PromptGroupSourceFolder } from '@shared/domain/assets/promptGroupFolders';

export function WorkshopGroupFolderPicker({ value, onChange, folders, categories, groups }: {
  value: string;
  onChange: (id: string) => void;
  folders: PromptGroupSourceFolder[];
  categories: AssetProductCategory[];
  groups: Array<{ productCategoryIds?: string | null; productSubcategory?: string | null }>;
}) {
  const selected = folders.find(folder => folder.id === value);
  return <div className="mb-3">
    <label className="block text-xs font-semibold text-slate-800 dark:text-slate-100">母本文件夹
      <select aria-label="母本文件夹" value={value} onChange={event => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]">
        <option value="auto">按商品自动匹配文件夹</option>
        {value !== 'auto' && !selected && <option value={value} disabled>原文件夹已删除或与拍摄架构不符，请重新选择</option>}
        {folders.filter(folder => !folder.subcategory).map(major => <optgroup key={major.id} label={major.name}>
          {folders.filter(folder => folder.majorId === major.id).map(folder => <option key={folder.id} value={folder.id}>
            {folder.subcategory ? `${major.name} / ${folder.name}` : `${major.name} · 全部子文件夹`} · {filterPromptGroupsByFolder(groups, categories, folder.id).length} 组母本
          </option>)}
        </optgroup>)}
      </select>
    </label>
    <p className="mt-1.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{selected
      ? `仅从「${selected.majorName}${selected.subcategory ? ` / ${selected.name}` : ''}」选择图组，仍需与每款商品匹配。`
      : value === 'auto' ? '沿用资产库的商品大类与子文件夹；采集商品后逐款匹配，支持混合批次。'
        : '文件夹选择已失效，请重新选择后再分析。'}</p>
  </div>;
}
