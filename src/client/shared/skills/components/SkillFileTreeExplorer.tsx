import { useEffect, useState } from 'react';
import {
  FilePlus,
  FolderPlus,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Trash2,
  Edit2,
} from 'lucide-react';
import {
  createParentIdForSelection,
  findParentId,
  isProtectedSkillFile,
  siblingNames,
  validateSkillNodeName,
  type SkillFileNode,
} from '../model/skillFileTree';

export interface SkillFileTreeExplorerProps {
  nodes: SkillFileNode[];
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  onAddNode: (parentId: string | null, name: string, type: 'file' | 'folder') => void;
  onRenameNode: (id: string, newName: string) => void;
  onDeleteNode: (id: string) => void;
  onToggleFolder: (id: string) => void;
  dirtyIds: ReadonlySet<string>;
  onNotify: (message: string) => void;
}

export function SkillFileTreeExplorer({
  nodes,
  activeFileId,
  onSelectFile,
  onAddNode,
  onRenameNode,
  onDeleteNode,
  onToggleFolder,
  dirtyIds,
  onNotify,
}: SkillFileTreeExplorerProps) {
  const [inlineCreateType, setInlineCreateType] = useState<'file' | 'folder' | null>(null);
  const [inlineParentId, setInlineParentId] = useState<string | null>(null);
  const [inlineName, setInlineName] = useState('');

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<'file' | 'folder' | null>(null);

  useEffect(() => {
    if (!menuNodeId) return;
    const close = () => setMenuNodeId(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuNodeId]);

  const startCreate = (type: 'file' | 'folder', parentId?: string | null) => {
    setInlineCreateType(type);
    setInlineParentId(parentId === undefined ? createParentIdForSelection(nodes, activeFileId) : parentId);
    setInlineName(type === 'file' ? 'new_file.md' : 'new_folder');
  };

  const confirmCreate = () => {
    const error = validateSkillNodeName(inlineName, siblingNames(nodes, inlineParentId));
    if (error || !inlineCreateType) {
      if (error) onNotify(error);
      return;
    }
    onAddNode(inlineParentId, inlineName.trim(), inlineCreateType);
    setInlineCreateType(null);
    setInlineName('');
  };

  const cancelCreate = () => {
    setInlineCreateType(null);
    setInlineName('');
  };

  const startRename = (node: SkillFileNode) => {
    setRenamingId(node.id);
    setRenameValue(node.name);
    setMenuNodeId(null);
  };

  const confirmRename = () => {
    if (!renamingId) return;
    const parentId = findParentId(nodes, renamingId) ?? null;
    const error = validateSkillNodeName(renameValue, siblingNames(nodes, parentId, renamingId));
    if (error) {
      onNotify(error);
      return;
    }
    onRenameNode(renamingId, renameValue.trim());
    setRenamingId(null);
    setRenameValue('');
  };

  const renderNode = (node: SkillFileNode, depth = 0) => {
    const isSelected = node.id === activeFileId;
    const isRenaming = renamingId === node.id;
    const isFolder = node.type === 'folder';
    const protectedFile = isProtectedSkillFile(nodes, node.id);

    return (
      <div key={node.id} className="flex flex-col">
        <div
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => {
            if (isFolder) onToggleFolder(node.id);
            else onSelectFile(node.id);
          }}
          className={`group relative flex h-8 items-center justify-between rounded-lg px-2 text-xs transition-colors cursor-pointer select-none ${
            isSelected
              ? 'bg-slate-200/80 dark:bg-white/15 font-semibold text-slate-900 dark:text-white'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
          }`}
        >
          <div className="flex items-center gap-1.5 overflow-hidden">
            {isFolder ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFolder(node.id);
                }}
                className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {node.isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="text-[10px] text-slate-400 dark:text-slate-500">•</span>
            )}

            {isRenaming ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="h-6 w-24 rounded border border-black/20 dark:border-white/20 bg-white dark:bg-[#202024] px-1 text-xs text-slate-900 dark:text-white outline-none"
                />
                <button
                  type="button"
                  onClick={confirmRename}
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-white hover:bg-slate-800"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  className="flex h-5 w-5 items-center justify-center text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <span className="truncate text-xs">{node.name}</span>
                {dirtyIds.has(node.id) && <span className="text-slate-400" aria-hidden="true">•</span>}
              </>
            )}
          </div>

          {!isRenaming && !protectedFile && (
            <div
              className="relative opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setMenuNodeId(menuNodeId === node.id ? null : node.id)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                aria-label="更多操作"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>

              {menuNodeId === node.id && (
                <div className="absolute right-0 top-full mt-1 z-30 w-28 overflow-hidden rounded-xl border border-black/[0.08] dark:border-white/10 bg-white dark:bg-[#1E1E22] p-1 shadow-lg">
                  {isFolder && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuNodeId(null);
                        startCreate('file', node.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                      <FilePlus className="h-3 w-3" />
                      <span>新建子文件</span>
                    </button>
                  )}
                  {!protectedFile && (
                    <button
                      type="button"
                      onClick={() => startRename(node)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>重命名</span>
                    </button>
                  )}
                  {!protectedFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuNodeId(null);
                        onDeleteNode(node.id);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>删除</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {isFolder && node.isOpen && node.children && (
          <div className="flex flex-col">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full w-48 sm:w-52 shrink-0 flex-col border-r border-black/[0.06] dark:border-white/[0.08] bg-[#F7F8FA] dark:bg-[#151518] p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">目录</span>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => startCreate('file')}
              onMouseEnter={() => setHoverTooltip('file')}
              onMouseLeave={() => setHoverTooltip(null)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/80 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
              aria-label="添加文件"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
            {hoverTooltip === 'file' && (
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-0.5 text-[11px] font-medium text-white shadow-md z-40 animate-fade-in pointer-events-none">
                添加文件
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => startCreate('folder')}
              onMouseEnter={() => setHoverTooltip('folder')}
              onMouseLeave={() => setHoverTooltip(null)}
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/80 dark:hover:bg-white/10 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
              aria-label="添加文件夹"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            {hoverTooltip === 'folder' && (
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-black px-2 py-0.5 text-[11px] font-medium text-white shadow-md z-40 animate-fade-in pointer-events-none">
                添加文件夹
              </div>
            )}
          </div>
        </div>
      </div>

      {inlineCreateType && (
        <div className="mb-2 flex items-center gap-1 rounded-lg border border-black/15 dark:border-white/20 bg-white dark:bg-[#1E1E22] p-1.5 shadow-xs">
          <input
            type="text"
            autoFocus
            value={inlineName}
            onChange={(e) => setInlineName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmCreate();
              if (e.key === 'Escape') cancelCreate();
            }}
            placeholder={inlineCreateType === 'file' ? '文件名...' : '文件夹名...'}
            className="w-full bg-transparent text-xs text-slate-900 dark:text-white outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={confirmCreate}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black text-white hover:bg-slate-800 cursor-pointer"
            aria-label="确认"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={cancelCreate}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
            aria-label="取消"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {nodes.map((node) => renderNode(node))}
      </div>
    </div>
  );
}
