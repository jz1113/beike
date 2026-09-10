import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  ChevronRight,
  FolderUp,
  Paperclip,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { AssistantSkillIcon } from './AssistantSkillIcon';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import type { AssistantSkill } from '@beike/domain/assistant/skills/types';
import AssistantSkillEditorModal from './AssistantSkillEditorModal';
import AssistantSkillManageModal from './AssistantSkillManageModal';

interface Props {
  showToast: (msg: string) => void;
  onUploadFiles: () => void;
  /** 有激活技能或待发送附件时高亮 + 按钮 */
  hasContext?: boolean;
}

const POPOVER_VIEWPORT_PADDING = 8;
const MAIN_MENU_WIDTH = 152;
const SUBMENU_WIDTH = 300;
const SUBMENU_GAP = 6;

function useCoarsePointer() {
  const [isCoarse, setIsCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(hover: none), (pointer: coarse)');
    const update = () => setIsCoarse(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isCoarse;
}

export default function AssistantSkillsMenu({ showToast, onUploadFiles, hasContext }: Props) {
  const {
    activeAssistantSkillId,
    setActiveAssistantSkillId,
    getAllAssistantSkills,
    addAssistantSkill,
    updateAssistantSkill,
    deleteAssistantSkill,
    importAssistantSkillFromFile,
  } = useAppStore(
    useShallow((s) => ({
      activeAssistantSkillId: s.activeAssistantSkillId,
      setActiveAssistantSkillId: s.setActiveAssistantSkillId,
      getAllAssistantSkills: s.getAllAssistantSkills,
      addAssistantSkill: s.addAssistantSkill,
      updateAssistantSkill: s.updateAssistantSkill,
      deleteAssistantSkill: s.deleteAssistantSkill,
      importAssistantSkillFromFile: s.importAssistantSkillFromFile,
    })),
  );

  const isCoarsePointer = useCoarsePointer();
  const [showMenu, setShowMenu] = useState(false);
  const [showSkillsSubmenu, setShowSkillsSubmenu] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [editorSkill, setEditorSkill] = useState<AssistantSkill | null | undefined>(undefined);
  const [showManage, setShowManage] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ bottom: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const skillFileRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const submenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const skills = getAllAssistantSkills();

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setShowSkillsSubmenu(false);
    setKeyword('');
  }, []);

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const popoverWidth = showSkillsSubmenu
      ? MAIN_MENU_WIDTH + SUBMENU_WIDTH + SUBMENU_GAP
      : MAIN_MENU_WIDTH;
    let left = rect.left;
    const maxLeft = window.innerWidth - popoverWidth - POPOVER_VIEWPORT_PADDING;
    if (left > maxLeft) left = Math.max(POPOVER_VIEWPORT_PADDING, maxLeft);
    if (left < POPOVER_VIEWPORT_PADDING) left = POPOVER_VIEWPORT_PADDING;
    setPopoverPos({
      bottom: Math.max(12, window.innerHeight - rect.top + 8),
      left,
    });
  }, [showSkillsSubmenu]);

  useEffect(() => {
    if (!showMenu) return;
    updatePopoverPosition();
    const onResize = () => updatePopoverPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [showMenu, showSkillsSubmenu, updatePopoverPosition]);

  useEffect(() => {
    if (!showMenu || !popoverRef.current) return;
    const observer = new ResizeObserver(() => updatePopoverPosition());
    observer.observe(popoverRef.current);
    return () => observer.disconnect();
  }, [showMenu, showSkillsSubmenu, updatePopoverPosition]);

  useEffect(() => {
    if (!showMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target)
        || popoverRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showMenu, closeMenu]);

  useEffect(() => {
    if (showSkillsSubmenu && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSkillsSubmenu]);

  useEffect(() => {
    return () => {
      if (submenuCloseTimerRef.current) clearTimeout(submenuCloseTimerRef.current);
    };
  }, []);

  const openSkillsSubmenu = useCallback(() => {
    if (submenuCloseTimerRef.current) {
      clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
    setShowSkillsSubmenu(true);
  }, []);

  const scheduleCloseSkillsSubmenu = useCallback(() => {
    if (isCoarsePointer) return;
    if (submenuCloseTimerRef.current) clearTimeout(submenuCloseTimerRef.current);
    submenuCloseTimerRef.current = setTimeout(() => {
      setShowSkillsSubmenu(false);
      submenuCloseTimerRef.current = null;
    }, 150);
  }, [isCoarsePointer]);

  const handleSkillsRowClick = useCallback(() => {
    if (isCoarsePointer) {
      setShowSkillsSubmenu((prev) => !prev);
    }
  }, [isCoarsePointer]);

  const filteredSkills = skills.filter((s) => {
    const q = keyword.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q)
      || s.description.toLowerCase().includes(q)
      || s.id.toLowerCase().includes(q)
    );
  });

  const handleSelectSkill = (skill: AssistantSkill) => {
    const next = activeAssistantSkillId === skill.id ? null : skill.id;
    setActiveAssistantSkillId(next);
    closeMenu();
  };

  const handleImportFile = async (file: File) => {
    try {
      const skill = await importAssistantSkillFromFile(file);
      showToast(`已导入技能：${skill.name}`);
      closeMenu();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '技能文件解析失败');
    }
  };

  const isHighlighted = showMenu || hasContext || Boolean(activeAssistantSkillId);

  const popover = showMenu ? (
    <div
      ref={popoverRef}
      className="fixed z-[100] animate-fade-in"
      style={{ bottom: popoverPos.bottom, left: popoverPos.left }}
      onClick={(e) => e.stopPropagation()}
      onMouseLeave={scheduleCloseSkillsSubmenu}
    >
      {/* 主菜单（Level 1） */}
      <div className="relative w-[152px] rounded-2xl bg-white/95 backdrop-blur-2xl border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.14)] p-1.5 text-slate-800">
        <button
          type="button"
          onClick={() => {
            onUploadFiles();
            closeMenu();
          }}
          onMouseEnter={() => setShowSkillsSubmenu(false)}
          className="w-full px-3 py-2 rounded-xl text-left text-xs hover:bg-slate-100 flex items-center gap-2.5 transition-colors cursor-pointer text-slate-700 hover:text-slate-900"
        >
          <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="font-medium">上传附件</span>
        </button>

        <button
          type="button"
          onClick={handleSkillsRowClick}
          onMouseEnter={openSkillsSubmenu}
          onFocus={openSkillsSubmenu}
          className={`w-full px-3 py-2 rounded-xl text-left text-xs flex items-center gap-2.5 transition-colors cursor-pointer ${
            showSkillsSubmenu
              ? 'bg-violet-50 text-violet-900 font-semibold'
              : 'hover:bg-slate-100 text-slate-700 hover:text-slate-900'
          }`}
        >
          <AssistantSkillIcon className={`w-4 h-4 shrink-0 ${showSkillsSubmenu ? 'text-violet-600' : 'text-slate-500'}`} />
          <span className="flex-1 font-medium">技能</span>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showSkillsSubmenu ? 'text-violet-500 translate-x-0.5' : 'text-slate-400'}`} />
        </button>

        {/* 技能二级菜单（Level 2，对齐底部向上展开，单行列表对齐图 4，无 SVG 背景对齐图 5） */}
        <div
          className={`absolute left-full bottom-0 ml-1.5 w-[380px] rounded-2xl bg-white/95 backdrop-blur-2xl border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.16)] flex flex-col max-h-[min(26rem,calc(100vh-140px))] overflow-hidden text-slate-800 transition-[opacity,transform] duration-150 ${
            showSkillsSubmenu
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 -translate-x-1 pointer-events-none'
          }`}
          onMouseEnter={openSkillsSubmenu}
          onMouseLeave={scheduleCloseSkillsSubmenu}
        >
          {/* 1. 搜索框 */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs focus-within:border-amber-400 transition-colors">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索"
                className="flex-1 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 outline-none"
                tabIndex={showSkillsSubmenu ? 0 : -1}
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword('')}
                  className="p-0.5 rounded-full hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* 2. 技能列表（单行紧凑模式，对齐图 4） */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin min-h-[80px] max-h-56">
            {filteredSkills.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-6">暂无匹配技能</p>
            ) : (
              filteredSkills.map((skill) => {
                const isActive = activeAssistantSkillId === skill.id;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => handleSelectSkill(skill)}
                    className={`w-full h-8 px-2.5 rounded-lg text-left flex items-center gap-2 transition-colors cursor-pointer group/item ${
                      isActive
                        ? 'bg-amber-50 text-amber-900 font-medium'
                        : 'hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                    }`}
                  >
                    {/* 纯净矢量图标（无背景，对齐图 4/图 5） */}
                    <AssistantSkillIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" strokeWidth={1.8} />

                    {/* 技能名称 */}
                    <span className="text-xs font-medium text-slate-800 shrink-0 max-w-[100px] truncate">
                      {skill.name}
                    </span>

                    {/* 技能描述（单行填满中间） */}
                    <span className="text-[11px] text-slate-400 truncate flex-1 font-normal">
                      {skill.description}
                    </span>

                    {/* 右侧轻量状态/提示（对齐图 4 的点击立即使用） */}
                    {isActive ? (
                      <span className="text-[10px] text-amber-600 font-medium shrink-0 flex items-center gap-0.5">
                        <Check className="w-3 h-3 text-amber-600" />
                        <span>本次使用</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                        点击立即使用
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* 3. 底部操作按钮 */}
          <div className="p-1.5 border-t border-slate-100 space-y-0.5 bg-slate-50/50">
            <button
              type="button"
              onClick={() => skillFileRef.current?.click()}
              className="w-full h-8 px-2.5 rounded-lg text-left text-xs text-slate-700 hover:bg-white hover:text-slate-900 flex items-center gap-2 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
            >
              <FolderUp className="w-3.5 h-3.5 text-slate-500" />
              <span>上传技能文件</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditorSkill(null);
                closeMenu();
              }}
              className="w-full h-8 px-2.5 rounded-lg text-left text-xs text-slate-700 hover:bg-white hover:text-slate-900 flex items-center gap-2 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
            >
              <Plus className="w-3.5 h-3.5 text-slate-500" />
              <span>创建技能</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowManage(true);
                closeMenu();
              }}
              className="w-full h-8 px-2.5 rounded-lg text-left text-xs text-slate-700 hover:bg-white hover:text-slate-900 flex items-center gap-2 transition-colors cursor-pointer border border-transparent hover:border-slate-200"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>管理技能</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (showMenu) {
            closeMenu();
          } else {
            setShowSkillsSubmenu(Boolean(activeAssistantSkillId));
            updatePopoverPosition();
            setShowMenu(true);
          }
        }}
        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all cursor-pointer border shadow-2xs shrink-0 ${
          isHighlighted
            ? 'bg-violet-100 hover:bg-violet-200 text-violet-900 border-violet-200'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-200/70'
        }`}
        title="附件与技能"
      >
        <Plus className="w-4 h-4" />
      </button>

      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}

      <input
        ref={skillFileRef}
        type="file"
        accept=".md,.json,text/markdown,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
          e.target.value = '';
        }}
      />

      <AssistantSkillEditorModal
        isOpen={editorSkill !== undefined}
        onClose={() => setEditorSkill(undefined)}
        showToast={showToast}
        initialSkill={editorSkill || null}
        onSave={(skill) => {
          if (editorSkill?.id && !editorSkill.isBuiltin) {
            updateAssistantSkill(skill.id, skill);
          } else {
            addAssistantSkill(skill);
          }
        }}
        onDelete={(id) => deleteAssistantSkill(id)}
      />

      <AssistantSkillManageModal
        isOpen={showManage}
        onClose={() => setShowManage(false)}
        skills={skills}
        activeSkillId={activeAssistantSkillId}
        onActivate={setActiveAssistantSkillId}
        onEdit={(skill) => {
          setShowManage(false);
          setEditorSkill(skill);
        }}
        onDelete={deleteAssistantSkill}
        showToast={showToast}
      />
    </>
  );
}
