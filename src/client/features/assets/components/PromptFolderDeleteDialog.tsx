import type { PromptGroupFolder } from '../model/promptGroupFolder';

export function PromptFolderDeleteDialog({ folders, saving, error, onCancel, onDelete }: {
  folders: PromptGroupFolder[];
  saving: boolean;
  error: string;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const groupCount = new Set(folders.flatMap(folder => folder.items.map(item => item.id))).size;
  return <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-[2px]"
    onMouseDown={event => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
    <div role="alertdialog" aria-modal="true" aria-label="删除文件夹"
      onKeyDown={event => { if (event.key === 'Escape' && !saving) onCancel(); }}
      className="w-full max-w-sm rounded-2xl border border-white bg-white p-5 shadow-2xl dark:bg-[#18191c]">
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">删除 {folders.length} 个文件夹？</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{folders.map(folder => folder.name).join('、')}中的 {groupCount} 组母本会移至待分类。图片和提示词都会保留。</p>
      {error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10">取消</button>
        <button type="button" disabled={saving} onClick={onDelete} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">{saving ? '删除中…' : '删除'}</button>
      </div>
    </div>
  </div>;
}
