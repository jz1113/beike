import { useAssistantDialog } from '../../hooks/useAssistantDialog';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal, RefreshCw, Search, X } from 'lucide-react';
import { AssistantSkillCardIcon } from './AssistantSkillIcon';
import FormattedMarkdown from '../message/FormattedMarkdown';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  skills: AssistantSkill[];
  activeSkillId: string | null;
  onActivate: (id: string | null) => void;
  onEdit: (skill: AssistantSkill) => void;
  onDelete: (id: string) => Promise<void>;
  showToast: (msg: string) => void;
}

function skillTitle(skill: AssistantSkill) {
  return skill.displayName || skill.name;
}

function SkillIconWell({ skill, size = 'md' }: { skill: AssistantSkill; size?: 'sm' | 'md' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-white/10 ${size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'}`}>
      <AssistantSkillCardIcon skill={skill} size={size === 'sm' ? 'sm' : 'md'} />
    </span>
  );
}

export default function AssistantSkillManageModal({
  isOpen,
  onClose,
  skills,
  activeSkillId,
  onActivate,
  onEdit,
  onDelete,
  showToast,
}: Props) {
  const dialogRef = useAssistantDialog(isOpen, onClose);
  const menuRef = useRef<HTMLDivElement>(null);
  const [keyword, setKeyword] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  if (!isOpen) return null;

  const selectedSkill = selectedSkillId
    ? skills.find((s) => s.id === selectedSkillId) || null
    : null;

  const sortedSkills = [...skills].sort((a, b) => {
    if (a.id === 'prompt-reverse-engineer' || a.name === '提示词反推专家') return -1;
    if (b.id === 'prompt-reverse-engineer' || b.name === '提示词反推专家') return 1;
    return 0;
  });

  const filtered = sortedSkills.filter((s) => {
    const q = keyword.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.displayName && s.displayName.toLowerCase().includes(q)) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  const handleClose = () => {
    setSelectedSkillId(null);
    setMenuOpen(false);
    setKeyword('');
    onClose();
  };

  const closeDetail = () => {
    setSelectedSkillId(null);
    setMenuOpen(false);
  };

  const handleToggleActive = (skillId: string) => {
    const isCurrentlyActive = activeSkillId === skillId;
    const nextId = isCurrentlyActive ? null : skillId;
    onActivate(nextId);
    const targetSkill = skills.find((s) => s.id === skillId);
    const title = targetSkill ? skillTitle(targetSkill) : '技能';
    showToast(nextId ? `本次使用「${title}」` : `已取消本次选择「${title}」`);
  };

  return createPortal(
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="技能管理" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/15 p-4 backdrop-blur-[2px] animate-fade-in select-none">
      <div className="relative flex h-[min(720px,90vh)] w-full max-w-[920px] flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-slate-50 text-slate-900 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.3)] dark:border-white/10 dark:bg-[#161618] dark:text-[#EDEDED] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
        <div className="flex shrink-0 items-center justify-between px-6 py-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">技能</h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭"
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 px-6 pb-3">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索技能"
              className="w-full rounded-xl border border-slate-200/80 bg-white py-2 pl-9 pr-4 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-slate-300 sm:text-sm dark:border-white/10 dark:bg-[#1B1B1E] dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-white/20"
            />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-x-2 gap-y-0.5 overflow-y-auto px-4 pb-4 sm:grid-cols-2">
          {filtered.length === 0 ? (
            <div className="col-span-full py-16 text-center text-xs text-slate-400 dark:text-slate-500">
              暂无匹配技能
            </div>
          ) : (
            filtered.map((skill) => {
              const isActive = activeSkillId === skill.id;
              const title = skillTitle(skill);
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => setSelectedSkillId(skill.id)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-white dark:hover:bg-white/5"
                >
                  <SkillIconWell skill={skill} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                      {skill.description || '暂无描述'}
                    </span>
                  </span>
                  {isActive && (
                    <Check className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-label="正在使用" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {selectedSkill && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/25 p-4 dark:bg-black/45"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDetail();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={skillTitle(selectedSkill)}
              className="flex max-h-full w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-slate-900 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-[#1B1B1E] dark:text-[#EDEDED]"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
                <SkillIconWell skill={selectedSkill} size="sm" />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activeSkillId === selectedSkill.id}
                    aria-label={activeSkillId === selectedSkill.id ? '取消使用' : '本次使用'}
                    onClick={() => handleToggleActive(selectedSkill.id)}
                    className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${
                      activeSkillId === selectedSkill.id
                        ? 'justify-end bg-blue-500'
                        : 'justify-start bg-slate-300 dark:bg-white/20'
                    }`}
                  >
                    <span className="h-5 w-5 rounded-full bg-white shadow-md dark:bg-[#18191c]" />
                  </button>
                  {!selectedSkill.isBuiltin && (
                    <div className="relative" ref={menuRef}>
                      <button
                        type="button"
                        aria-label="更多"
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen((open) => !open)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuOpen && (
                        <div className="absolute right-0 top-full z-20 mt-1 min-w-[120px] overflow-hidden rounded-xl border border-slate-200/80 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-[#242428]">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              onEdit(selectedSkill);
                              handleClose();
                            }}
                            className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/10"
                          >
                            编辑
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={closeDetail}
                    aria-label="关闭详情"
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="shrink-0 px-5 pb-3 pt-3">
                <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  {skillTitle(selectedSkill)}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {selectedSkill.description}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5">
                <div className="max-h-[320px] overflow-y-auto rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 text-slate-700 dark:border-white/10 dark:bg-[#141416] dark:text-slate-300">
                  <FormattedMarkdown
                    content={selectedSkill.markdownDoc || selectedSkill.prompt}
                    className="leading-relaxed text-slate-700 dark:text-slate-300"
                  />
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4">
                {!selectedSkill.isBuiltin ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await onDelete(selectedSkill.id);
                        showToast('技能已删除');
                        closeDetail();
                      } catch (error) { showToast(error instanceof Error ? error.message : '删除失败'); }
                    }}
                    className="text-sm font-medium text-red-500 transition-colors hover:text-red-600 dark:text-rose-400 dark:hover:text-rose-300"
                  >
                    卸载
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (activeSkillId !== selectedSkill.id) {
                      onActivate(selectedSkill.id);
                      showToast(`已为本条消息选择「${skillTitle(selectedSkill)}」`);
                    }
                    handleClose();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  立即试用
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
