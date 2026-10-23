import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { usePromptFolderRules, type PromptFolderRulesProps } from '../../hooks/usePromptFolderRules';
import { usePromptRulesDialogFocus } from '../../hooks/usePromptRulesDialogFocus';
import { PromptFolderRulesAdvanced } from './PromptFolderRulesAdvanced';

export function PromptFolderRulesDialog(props: PromptFolderRulesProps) {
  const rules = usePromptFolderRules(props);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);
  usePromptRulesDialogFocus(dialogRef, () => { void rules.close(); });
  const majors = rules.definitions.filter(category => !category.parentId && !category.isArchived);
  const children = rules.definitions.filter(category => category.parentId === rules.root?.id && !category.isArchived);
  const busy = !!rules.saving;
  const selectedUnavailable = !rules.selected || !!rules.selected.isArchived;
  const cannotEdit = busy || rules.readOnly || rules.sourceChanged || selectedUnavailable;

  return createPortal(<div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 p-2 backdrop-blur-[2px] sm:p-4"
    onMouseDown={event => { if (event.target === event.currentTarget) void rules.close(); }}>
    <form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} tabIndex={-1}
      onSubmit={event => { event.preventDefault(); void rules.save(); }}
      className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] dark:bg-[#18191c]">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 p-4 sm:px-5 dark:border-white/10">
        <div className="min-w-0">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100"><SlidersHorizontal className="h-4 w-4 shrink-0 text-indigo-600" />文件夹分类规则</h2>
          <p id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">关键词帮助识别商品类目，适用部位用于提示词反推。规则与实际文件夹一起保存。</p>
        </div>
        <button type="button" aria-label="关闭规则编辑器" disabled={busy} onClick={() => { void rules.close(); }}
          className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>

      <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">商品大类
            <select data-autofocus aria-label="商品大类" value={rules.root?.id || ''} disabled={busy} onChange={event => { void rules.select(event.target.value); }}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]">
              {!rules.root && <option value="" disabled>文件夹不可用</option>}
              {majors.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">编辑目标
            <select aria-label="编辑目标" value={rules.selected?.id === rules.root?.id ? '' : rules.draft.id} disabled={busy || !rules.root} onChange={event => { void rules.select(event.target.value || rules.root?.id || ''); }}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]">
              <option value="">当前大类本身</option>
              {children.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
        </div>

        {rules.readOnly && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">此文件夹来自只读资产库，可以查看规则，不能修改。</p>}
        {rules.sourceChanged && <div role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {selectedUnavailable ? '当前文件夹已删除或归档，请选择其他文件夹。' : '文件夹定义已更新。当前编辑内容已保留，请重新读取后再保存。'}
          {!selectedUnavailable && <button type="button" disabled={busy} onClick={() => { void rules.reload(); }} className="ml-2 font-semibold underline">重新读取规则</button>}
        </div>}
        <label className="mt-4 block text-xs font-semibold text-slate-700 dark:text-slate-200">匹配关键词
          <textarea aria-label="匹配关键词" value={rules.draft.keywords} onChange={event => rules.edit('keywords', event.target.value)} disabled={cannotEdit} rows={4} maxLength={20_000}
            placeholder="使用逗号、分号或换行分隔，例如：透明手机壳，磁吸保护壳"
            className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]" />
        </label>
        <label className="mt-3 block text-xs font-semibold text-slate-700 dark:text-slate-200">适用部位
          <textarea aria-label="适用部位" value={rules.draft.anatomy} onChange={event => rules.edit('anatomy', event.target.value)} disabled={cannotEdit} rows={2} maxLength={3_000}
            placeholder="例如：手腕，手指，领口；留空表示不限制部位"
            className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500 dark:text-slate-100 dark:border-white/10 dark:bg-[#18191c]" />
        </label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">最多 200 个关键词、32 个部位，每项最多 80 字；自动去重。</p>
          <button type="button" disabled={cannotEdit} onClick={rules.recommend} className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-indigo-600 hover:bg-indigo-50 disabled:opacity-40 dark:border-white/10">填入当前文件夹推荐规则</button>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-400">推荐只填入当前编辑内容。匹配已有默认规则时使用该定义，其他文件夹仅以名称推荐关键词；点击保存后生效。</p>
        {!!rules.errors.length && <ul role="alert" className="mt-3 space-y-1 text-xs text-rose-600">{rules.errors.map(error => <li key={error}>{error}</li>)}</ul>}
        {rules.root && <PromptFolderRulesAdvanced root={rules.root} text={rules.importText} onTextChange={rules.setImportText} mode={rules.importMode} onModeChange={rules.setImportMode}
          busy={busy} readOnly={rules.importReadOnly} blocked={rules.sourceChanged || selectedUnavailable} onImport={rules.importItems} />}
      </div>

      <div className="shrink-0 border-t border-slate-100 px-4 py-3 sm:px-5 dark:border-white/10">
        {rules.error && <p role="alert" className="mb-2 break-words text-xs leading-5 text-rose-600">{rules.error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" aria-live="polite" className="text-xs text-slate-500 dark:text-slate-400">{busy ? '正在保存，请稍候…' : rules.dirty ? '当前规则有未保存修改' : '当前规则已同步'}</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => { void rules.close(); }} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10">关闭</button>
            <button type="submit" disabled={cannotEdit || !rules.dirty || !!rules.errors.length} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">{rules.saving === 'save' ? '保存中…' : '保存当前规则'}</button>
          </div>
        </div>
      </div>
    </form>
  </div>, document.body);
}
