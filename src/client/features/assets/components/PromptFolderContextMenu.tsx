import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { FolderInput, FolderOpen, FolderPlus, Pencil, Settings2, Trash2 } from 'lucide-react';
import type { PromptGroupFolder } from '../model/promptGroupFolder';

interface Props {
  menu: { x: number; y: number; folder?: PromptGroupFolder; ids: string[] };
  menuRef: RefObject<HTMLDivElement | null>;
  folders: PromptGroupFolder[];
  onOpen: (id: string) => void;
  onRename: (folder: PromptGroupFolder) => void;
  onRules: (id: string) => void;
  onMoveGroups: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onCreate: () => void;
}

export function PromptFolderContextMenu({ menu, menuRef, folders, onOpen, onRename, onRules, onMoveGroups, onDelete, onCreate }: Props) {
  const selected = folders.filter(folder => menu.ids.includes(folder.id));
  const movableGroupIds = [...new Set(selected.flatMap(folder => folder.items.map(item => item.id)))];
  return createPortal(<div ref={menuRef} role="menu" aria-label={menu.folder ? `${menu.ids.length}个文件夹操作` : '文件夹空白区域操作'}
    className="fixed z-[135] min-w-44 rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[#18191c]/95"
    style={{ left: menu.x, top: menu.y }}>
    {menu.folder ? <>
      {menu.ids.length === 1 && <button type="button" role="menuitem" onClick={() => onOpen(menu.folder!.id)}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
        <FolderOpen className="h-3.5 w-3.5" />打开文件夹
      </button>}
      {menu.ids.length === 1 && !menu.folder.isVirtual && <button type="button" role="menuitem" onClick={() => onRename(menu.folder!)}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
        <Pencil className="h-3.5 w-3.5" />重命名
      </button>}
      {movableGroupIds.length > 0 && <button type="button" role="menuitem" onClick={() => onMoveGroups(movableGroupIds)}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
        <FolderInput className="h-3.5 w-3.5" />移动文件夹内的母组
      </button>}
      {menu.ids.length === 1 && !menu.folder.isVirtual && <button type="button" role="menuitem" onClick={() => onRules(menu.folder!.id)}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
        <Settings2 className="h-3.5 w-3.5" />分类规则
      </button>}
      {!selected.some(folder => folder.isVirtual) && <button type="button" role="menuitem" onClick={() => onDelete(menu.ids)}
        className="mt-1 flex w-full items-center gap-2 border-t border-slate-100 px-2.5 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 dark:border-white/10">
        <Trash2 className="h-3.5 w-3.5" />删除{menu.ids.length > 1 ? ` ${menu.ids.length} 个` : ''}文件夹
      </button>}
    </> : <button type="button" role="menuitem" onClick={onCreate}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700">
      <FolderPlus className="h-3.5 w-3.5" />新建文件夹
    </button>}
  </div>, document.body);
}
