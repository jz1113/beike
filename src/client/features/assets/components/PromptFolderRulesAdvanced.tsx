import { useMemo, useState } from 'react';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { AssetProductCategory } from '@shared/domain/assets/assetOrganization';
import { DEFAULT_SUBCATEGORIES_MAP, SUBCATEGORY_STORAGE_KEY_PREFIX } from '@shared/domain/products/product-category/defs';
import { isLegacyRuleRoot, previewFolderRuleImport, previewLegacyFolderRules, type FolderRuleImport, type FolderRulePreview } from '../model/promptFolderRules';

interface Props {
  root: AssetProductCategory;
  text: string;
  onTextChange: (value: string) => void;
  mode: 'append' | 'replace';
  onModeChange: (mode: 'append' | 'replace') => void;
  busy: boolean;
  readOnly: boolean;
  blocked: boolean;
  onImport: (items: FolderRuleImport[], mode: 'append' | 'replace', migration?: boolean) => Promise<boolean>;
}

function Preview({ preview }: { preview: FolderRulePreview }) {
  return <>
    {!!preview.sourceCount && <p className="mt-2 text-xs text-slate-500">{preview.sourceCount} 条原始记录，去重后 {preview.items.length} 个二级文件夹</p>}
    {!!preview.errors.length && <ul role="alert" className="mt-2 space-y-1 break-words text-xs text-rose-600">{preview.errors.map(error => <li key={error}>{error}</li>)}</ul>}
    {!!preview.items.length && <ul aria-label="导入规则预览" className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
      {preview.items.map(item => <li key={item.name} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
        <p className="break-words text-xs font-semibold text-slate-800">{item.name}</p>
        <p className="mt-1 break-words text-xs leading-5 text-slate-600">关键词：{item.keywords.join('、') || '未设置'}</p>
        {!!item.anatomy?.length && <p className="break-words text-xs leading-5 text-slate-500">部位：{item.anatomy.join('、')}</p>}
      </li>)}
    </ul>}
  </>;
}

export function PromptFolderRulesAdvanced({ root, text, onTextChange, mode, onModeChange, busy, readOnly, blocked, onImport }: Props) {
  const preview = useMemo(() => previewFolderRuleImport(text), [text]);
  const [cacheRevision, setCacheRevision] = useState(0);
  const legacy = useMemo(() => {
    void cacheRevision;
    try { return previewLegacyFolderRules(root.id, localStorage); }
    catch { return { items: [], errors: ['浏览器禁止读取本机缓存'], sourceCount: 0, ...(isLegacyRuleRoot(root.id) ? { key: `${SUBCATEGORY_STORAGE_KEY_PREFIX}${root.id}` } : {}) }; }
  }, [root.id, cacheRevision]);
  const otherCacheExists = useMemo(() => {
    if (isLegacyRuleRoot(root.id)) return false;
    try { return Object.keys(DEFAULT_SUBCATEGORIES_MAP).some(id => !!localStorage.getItem(`${SUBCATEGORY_STORAGE_KEY_PREFIX}${id}`)); }
    catch { return false; }
  }, [root.id]);
  const migrate = async () => {
    if (busy || readOnly || blocked || legacy.errors.length || !legacy.items.length) return;
    if (!(await confirmAction(`将本机旧缓存的 ${legacy.items.length} 个二级文件夹规则合并到「${root.name}」？同名关键词会合并，新名称会创建二级文件夹，原缓存备份会保留。`))) return;
    await onImport(legacy.items, 'append', true);
  };

  return <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60">
    <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">高级：批量导入与旧缓存迁移</summary>
    <div className="border-t border-slate-200 p-4">
      <p className="text-xs leading-5 text-slate-500">导入到大类「{root.name}」。已有同名二级文件夹更新规则，其他文件夹保留；新名称创建二级文件夹。文本导入保留已有部位规则。</p>
      {readOnly && <p className="mt-2 text-xs text-amber-700">当前大类来自只读资产库，不能导入或迁移规则。</p>}
      <label className="mt-3 block text-xs font-semibold text-slate-700">批量文本
        <textarea aria-label="批量文本" value={text} onChange={event => onTextChange(event.target.value)} disabled={busy || readOnly} rows={4}
          placeholder={'每行一个二级类目，例如：\n手机壳:透明壳,磁吸壳\n耳机:无线耳机,降噪耳机'}
          className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100" />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700">
        <label className="flex items-center gap-1.5"><input type="radio" name={`folder-rule-import-${root.id}`} checked={mode === 'append'} disabled={busy || readOnly} onChange={() => onModeChange('append')} />合并同名关键词</label>
        <label className="flex items-center gap-1.5"><input type="radio" name={`folder-rule-import-${root.id}`} checked={mode === 'replace'} disabled={busy || readOnly} onChange={() => onModeChange('replace')} />替换同名关键词</label>
      </div>
      <Preview preview={preview} />
      <button type="button" disabled={busy || readOnly || blocked || !preview.items.length || !!preview.errors.length} onClick={() => { void onImport(preview.items, mode); }}
        className="mt-3 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">确认导入 {preview.items.length} 个文件夹规则</button>

      <div className="mt-5 border-t border-slate-200 pt-4">
        <h3 className="text-xs font-semibold text-slate-700">旧版本机缓存</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">这里只读取当前原大类的本机备份。迁入会写入当前访问空间的实际文件夹，原缓存不会删除。</p>
        {legacy.key ? <>
          {!legacy.sourceCount && !legacy.errors.length && <p className="mt-2 text-xs text-slate-500">当前大类没有旧缓存。</p>}
          <Preview preview={legacy} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => setCacheRevision(value => value + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 disabled:opacity-40">重新读取备份</button>
            <button type="button" disabled={busy || readOnly || blocked || !legacy.items.length || !!legacy.errors.length} onClick={() => { void migrate(); }}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">确认合并到「{root.name}」</button>
          </div>
        </> : <p className="mt-2 text-xs leading-5 text-slate-500">{otherCacheExists ? '检测到其他原大类的旧缓存。' : ''}当前文件夹不对应旧缓存大类，请在原大类文件夹下预览迁移，不会复制另一套目录。</p>}
      </div>
    </div>
  </details>;
}
