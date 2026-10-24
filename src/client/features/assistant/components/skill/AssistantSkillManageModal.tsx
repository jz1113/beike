import { useAssistantDialog } from '../../hooks/useAssistantDialog';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useAppStore } from '@client/store';
import { resolveSkillKind } from '@shared/domain/assistant/skills/skillPurpose';
import { CreationSkillDetailModal } from '@client/shared/skills/components/CreationSkillDetailModal';
import { SkillCard } from '@client/shared/skills/components/SkillCard';
import { librarySkillItem } from '@client/shared/skills/model/libraryView';
import { CodexAgentSkillSection } from '@client/shared/skills/components/CodexAgentSkillSection';
import { CodexSkillDetailModal, assistantSkillTitle } from '@client/shared/skills/components/CodexSkillDetailModal';
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
  const [purpose, setPurpose] = useState<'agent' | 'creation'>('creation');
  const [keyword, setKeyword] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedSkill = selectedSkillId
    ? skills.find((s) => s.id === selectedSkillId) || null
    : null;

  const sortedSkills = skills
    .filter((skill) => resolveSkillKind(skill) === purpose)
    .sort((a, b) => {
      if (a.id === 'prompt-reverse-engineer' || a.name === '提示词反推专家') return -1;
      if (b.id === 'prompt-reverse-engineer' || b.name === '提示词反推专家') return 1;
      return 0;
    });

  const q = keyword.trim().toLowerCase();
  const filtered = sortedSkills.filter((s) => {
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.displayName && s.displayName.toLowerCase().includes(q)) ||
      (s.category && s.category.toLowerCase().includes(q)) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  const handleClose = () => {
    setSelectedSkillId(null);
    setKeyword('');
    onClose();
  };

  const handleToggleSkill = (skill: AssistantSkill) => {
    const isCurrentlyActive = activeSkillId === skill.id;
    const nextId = isCurrentlyActive ? null : skill.id;
    onActivate(nextId);
    const title = assistantSkillTitle(skill);
    showToast(nextId ? `本次使用「${title}」` : `已取消本次选择「${title}」`);
  };

  const handleTrySkill = (skill: AssistantSkill, initialPromptOverride?: string) => {
    const title = assistantSkillTitle(skill);
    if (activeSkillId !== skill.id) {
      onActivate(skill.id);
    }
    if (initialPromptOverride) {
      useAppStore.getState().setQuickPrompt(initialPromptOverride);
    }
    showToast(`已为本条消息选择「${title}」`);
    handleClose();
  };

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="技能管理"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-[2px] animate-fade-in select-none"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div className="relative flex h-[min(740px,90vh)] w-full max-w-[940px] flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-[#F7F8FA] text-slate-900 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#161618] dark:text-[#EDEDED] dark:shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
        <div className="flex shrink-0 items-center justify-between px-6 pt-5 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">技能</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              创作技能由你选择并替换主体参数；运行技能由 Agent 按需自动读取（共 {sortedSkills.length} 项）
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭"
            className="cursor-pointer rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="技能用途" className="flex gap-2 px-6 pb-3">
          {(['creation', 'agent'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={purpose === kind}
              onClick={() => {
                setPurpose(kind);
                setSelectedSkillId(null);
              }}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                purpose === kind
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-white/5'
              }`}
            >
              {kind === 'agent' ? 'Agent 运行技能' : '创作技能'}
            </button>
          ))}
        </nav>

        <div className="shrink-0 px-6 pb-3">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索技能名称、分类或能力描述…"
              className="w-full rounded-xl border border-slate-200/80 bg-white py-2 pl-9 pr-4 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-slate-300 sm:text-sm dark:border-white/10 dark:bg-[#1B1B1E] dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-white/20"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-2">
          {purpose === 'creation' ? (
            <div className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((skill) => {
                const item = librarySkillItem({ kind: 'assistant', content: skill });
                return (
                  <SkillCard
                    key={skill.id}
                    skill={item}
                    isFavorite={Boolean(skill.isFavorite)}
                    onToggleFavorite={() => {}}
                    onUseSkill={() => handleTrySkill(skill)}
                    onDetail={() => setSelectedSkillId(skill.id)}
                    onEdit={() => {
                      onEdit(skill);
                      handleClose();
                    }}
                    onDelete={() => {
                      void onDelete(skill.id);
                    }}
                    onFeed={() => {}}
                  />
                );
              })}
              {!filtered.length && (
                <p className="col-span-full py-10 text-center text-xs text-slate-400">
                  暂无匹配的创作模板
                </p>
              )}
            </div>
          ) : (
            <CodexAgentSkillSection
              skills={filtered}
              activeSkillId={activeSkillId}
              grouped={!q}
              compact
              onSelectSkill={(skill) => setSelectedSkillId(skill.id)}
              onQuickToggleSkill={handleToggleSkill}
            />
          )}
        </div>

        {selectedSkill && resolveSkillKind(selectedSkill) === 'creation' ? (
          <CreationSkillDetailModal
            key={selectedSkill.id}
            item={librarySkillItem({ kind: 'assistant', content: selectedSkill })}
            isFavorite={Boolean(selectedSkill.isFavorite)}
            onUse={(initialPromptOverride) => handleTrySkill(selectedSkill, initialPromptOverride)}
            onClose={() => setSelectedSkillId(null)}
            showToast={showToast}
          />
        ) : (
          <CodexSkillDetailModal
            usePortal={false}
            skill={selectedSkill}
            isActive={Boolean(selectedSkill && activeSkillId === selectedSkill.id)}
            onClose={() => setSelectedSkillId(null)}
            onToggleActive={handleToggleSkill}
            onTryNow={handleTrySkill}
            onEdit={(skill) => {
              onEdit(skill);
              handleClose();
            }}
            onDelete={async (skill) => {
              await onDelete(skill.id);
              showToast('技能已卸载');
            }}
            showToast={showToast}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
