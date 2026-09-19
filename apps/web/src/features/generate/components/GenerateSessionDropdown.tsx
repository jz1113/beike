import { useState, useRef, useEffect } from 'react';
import { SquarePen, PanelLeft, Trash2, Pencil } from 'lucide-react';
import type { ChatSession } from '@/store';
import { GenerateSessionThumbnail } from '../GenerateSessionThumbnail';

export interface GenerateSessionDropdownProps {
  sessions: ChatSession[];
  currentSessionId: string;
  activeSessionTitle?: string;
  onCreateSession: () => void;
  onSwitchSession: (id: string) => void;
  onDeleteSession: (id: string, title?: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
}

export function GenerateSessionDropdown({
  sessions,
  currentSessionId,
  activeSessionTitle,
  onCreateSession,
  onSwitchSession,
  onDeleteSession,
  onRenameSession,
}: GenerateSessionDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 点击外部自动关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setEditingSessionId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setEditingSessionId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // 开始重命名
  const handleStartRename = (e: React.MouseEvent, sess: ChatSession) => {
    e.stopPropagation();
    setEditingSessionId(sess.id);
    setEditTitle(sess.title || '未命名对话');
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  // 保存重命名
  const handleSaveRename = (sessId: string) => {
    const trimmed = editTitle.trim();
    if (trimmed) {
      onRenameSession(sessId, trimmed);
    }
    setEditingSessionId(null);
  };

  // 点击创建新对话
  const handleCreateNew = () => {
    onCreateSession();
    setIsOpen(false);
    setEditingSessionId(null);
  };

  // 点击选择对话
  const handleSelectSession = (id: string) => {
    if (editingSessionId === id) return;
    onSwitchSession(id);
    setIsOpen(false);
    setEditingSessionId(null);
  };

  // 点击删除对话
  const handleDelete = (e: React.MouseEvent, sess: ChatSession) => {
    e.stopPropagation();
    onDeleteSession(sess.id, sess.title);
  };

  const displayTitle = activeSessionTitle || '新创作对话';

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      {/* 🌟 1. 顶部触发胶囊按钮（完全对齐图 2 原版设计：标题 + | 细分割线 + 分栏图标） */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2 h-9 px-3.5 rounded-xl border transition-all text-sm font-medium cursor-pointer select-none shadow-2xs group ${
          isOpen
            ? 'bg-slate-100 border-slate-300 text-slate-900 shadow-xs'
            : 'bg-white hover:bg-slate-50 border-slate-200/90 hover:border-slate-300 text-slate-800'
        }`}
        title="切换或管理创作对话"
      >
        <span className="max-w-[140px] sm:max-w-[200px] md:max-w-[260px] truncate leading-none">
          {displayTitle}
        </span>
        <span className="text-slate-300 font-light mx-0.5 select-none leading-none">|</span>
        <PanelLeft className="w-4 h-4 text-slate-500 group-hover:text-slate-800 transition-colors shrink-0" />
      </button>

      {/* 🌟 2. 悬浮下拉面板（完全对齐图 2 原版卡片式设计） */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200/90 shadow-2xl rounded-2xl p-2.5 z-50 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 select-none">
          {/* 快捷新建对话按钮（对齐图 2：白底圆角卡片，加粗黑字与正方形线笔图标） */}
          <button
            type="button"
            onClick={handleCreateNew}
            className="w-full py-2.5 px-3.5 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200/90 transition-all text-slate-800 hover:text-black text-sm font-semibold flex items-center gap-2.5 cursor-pointer shadow-2xs group"
          >
            <SquarePen className="w-4.5 h-4.5 text-slate-700 group-hover:text-black shrink-0 stroke-[2]" />
            <span>新对话</span>
          </button>

          {/* 分组标识（对齐图 2：仅展示灰色的「最近」，彻底去除多余对话数量统计） */}
          <div className="px-2 pt-1 pb-0.5 text-xs font-medium text-slate-400">
            最近
          </div>

          {/* 最近对话列表 */}
          <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-0.5 scrollbar-thin">
            {sessions.map((sess) => {
              const isSelected = sess.id === currentSessionId;
              const isEditing = editingSessionId === sess.id;

              return (
                <div
                  key={sess.id}
                  onClick={() => handleSelectSession(sess.id)}
                  className={`group relative w-full px-2.5 py-2 rounded-xl flex items-center gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#F2F3F5] text-slate-900 font-semibold'
                      : 'hover:bg-slate-50 text-slate-800 font-medium'
                  }`}
                >
                  {/* 对话 1:1 正方形封面海报 / 默认消息气泡卡片（完全对齐图 2） */}
                  <div className="shrink-0 pointer-events-none">
                    <GenerateSessionThumbnail sess={sess} isSelected={isSelected} />
                  </div>

                  {/* 对话标题或重命名编辑框 */}
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div
                        className="w-full"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          ref={inputRef}
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => handleSaveRename(sess.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(sess.id);
                            if (e.key === 'Escape') setEditingSessionId(null);
                          }}
                          className="w-full text-sm font-medium px-2.5 py-1 bg-white border border-slate-300 rounded-lg outline-none text-slate-900 shadow-2xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"
                        />
                      </div>
                    ) : (
                      <span
                        className={`block text-sm truncate leading-snug ${
                          isSelected ? 'text-slate-900 font-semibold' : 'text-slate-800'
                        }`}
                        onDoubleClick={(e) => handleStartRename(e, sess)}
                        title={sess.title || '未命名对话'}
                      >
                        {sess.title || '未命名对话'}
                      </span>
                    )}
                  </div>

                  {/* 悬浮快捷操作菜单（重命名、删除，平时隐形，hover 淡入） */}
                  {!isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pr-0.5">
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(e, sess)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 transition-colors cursor-pointer"
                        title="重命名对话"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, sess)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="删除对话"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
export default GenerateSessionDropdown;
