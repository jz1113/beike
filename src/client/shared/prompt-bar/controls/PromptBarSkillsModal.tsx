import { useState, useRef, useEffect, useMemo, type ChangeEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Film, Layers, Search, X } from 'lucide-react';
import { useAppStore } from '@client/store';
import { CreationSkillDetailModal } from '@client/shared/skills/components/CreationSkillDetailModal';
import { SkillCard } from '@client/shared/skills/components/SkillCard';
import { librarySkillItem, skillPresentation } from '@client/shared/skills/model/libraryView';
import { CodexAgentSkillSection } from '@client/shared/skills/components/CodexAgentSkillSection';
import { CodexSkillDetailModal, assistantSkillTitle } from '@client/shared/skills/components/CodexSkillDetailModal';
import { loadSkillFavorites, saveSkillFavorites } from '@client/shared/skills/model/skillTypes';
import { BUILTIN_ASSISTANT_SKILLS, mergeAssistantSkills, type AssistantSkill } from '@shared/domain/assistant/skills';

const SKILL_TABS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '本次选择' },
  { key: 'my', label: '个人' },
  { key: 'favorite', label: '收藏' },
] as const;

type SkillTabKey = (typeof SKILL_TABS)[number]['key'];

interface PromptBarSkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  isUp?: boolean;
  onUseSkill: (skill: { id: string; title: string }, initialPromptOverride?: string) => void;
  onAgentCreate: () => void;
  onManualCreate: () => void;
  onUploadFiles: (files: File[]) => void;
}

export default function PromptBarSkillsModal({
  isOpen,
  onClose,
  onUseSkill,
  onAgentCreate,
  onManualCreate,
  onUploadFiles,
}: PromptBarSkillsModalProps) {
  const createMenuRef = useRef<HTMLDivElement>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  const [presentation, setPresentation] = useState<'agent' | 'creation'>('creation');
  const [selectedTab, setSelectedTab] = useState<SkillTabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => loadSkillFavorites());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const customSkills = useAppStore((s) => s.assistantCustomSkills);
  const activeAssistantSkillId = useAppStore((s) => s.activeAssistantSkillId);
  const setActiveAssistantSkillId = useAppStore((s) => s.setActiveAssistantSkillId);
  const deleteAssistantSkill = useAppStore((s) => s.deleteAssistantSkill);

  const skills = useMemo(() => mergeAssistantSkills(customSkills, BUILTIN_ASSISTANT_SKILLS), [customSkills]);
  const typeCounts = useMemo(
    () => ({
      creation: skills.filter((s) => skillPresentation(s) === 'creation').length,
      agent: skills.filter((s) => skillPresentation(s) === 'agent').length,
    }),
    [skills],
  );

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 2400);
  };

  useEffect(() => {
    if (!isOpen) {
      setShowCreateMenu(false);
      setSelectedSkillId(null);
      return;
    }
    void useAppStore.getState().refreshAssistantSkills().catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!showCreateMenu) return;
    const handleOutside = (event: globalThis.MouseEvent) => {
      if (!createMenuRef.current?.contains(event.target as Node)) setShowCreateMenu(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showCreateMenu]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedSkillId) {
          event.stopPropagation();
          setSelectedSkillId(null);
        } else onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, selectedSkillId]);

  if (!isOpen) return null;

  const q = searchQuery.trim().toLowerCase();
  const filteredSkills = skills.filter((skill) => {
    if (skillPresentation(skill) !== presentation) return false;
    if (selectedTab === 'active' && activeAssistantSkillId !== skill.id) return false;
    if (selectedTab === 'my' && skill.isBuiltin) return false;
    if (selectedTab === 'favorite' && !favorites.has(skill.id) && !favorites.has(`assistant:${skill.id}`) && !skill.isFavorite) {
      return false;
    }
    if (!q) return true;
    const title = assistantSkillTitle(skill).toLowerCase();
    return (
      title.includes(q) ||
      skill.name.toLowerCase().includes(q) ||
      Boolean(skill.category && skill.category.toLowerCase().includes(q)) ||
      skill.description.toLowerCase().includes(q)
    );
  });

  const selectedSkill = selectedSkillId ? skills.find((s) => s.id === selectedSkillId) || null : null;

  const handleToggleFavorite = (skill: AssistantSkill) => {
    const key = `assistant:${skill.id}`;
    const next = new Set(favorites);
    if (next.has(key) || next.has(skill.id)) {
      next.delete(key);
      next.delete(skill.id);
    } else next.add(key);
    setFavorites(next);
    saveSkillFavorites(next);
  };

  const handleToggleActive = (skill: AssistantSkill) => {
    const nextId = activeAssistantSkillId === skill.id ? null : skill.id;
    setActiveAssistantSkillId(nextId);
    const title = assistantSkillTitle(skill);
    showToast(nextId ? `本次指定「${title}」` : `已取消本次指定「${title}」`);
  };

  const handleTryNow = (skill: AssistantSkill, initialPromptOverride?: string) => {
    const title = assistantSkillTitle(skill);
    onUseSkill({ id: skill.id, title }, initialPromptOverride);
    setSelectedSkillId(null);
    onClose();
  };

  const handleUploadLocalSkill = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = '';
    if (files.length === 0) return;
    setShowCreateMenu(false);
    onClose();
    onUploadFiles(files);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="技能"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/20 p-4 backdrop-blur-[2px] animate-fade-in select-none dark:bg-black/50"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <input type="file" ref={uploadFileInputRef} accept=".md,.zip,.txt,text/markdown,application/zip" multiple className="hidden" onChange={handleUploadLocalSkill} />

      <div className="relative flex h-[min(760px,88vh)] w-full max-w-[1040px] flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-[#F7F8FA] text-slate-900 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#161618] dark:text-[#EDEDED] dark:shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-6 pt-5 pb-4 dark:border-white/[0.07]">
          <nav aria-label="技能类型" className="flex items-center rounded-full bg-slate-200/70 p-1 dark:bg-white/[0.06]">
            {([
              ['creation', '创作技能', Film],
              ['agent', 'Agent 运行技能', Layers],
            ] as const).map(([kind, label, Icon]) => {
              const active = presentation === kind;
              return (
                <button
                  type="button"
                  key={kind}
                  aria-pressed={active}
                  onClick={() => setPresentation(kind)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? 'bg-white text-slate-950 shadow-2xs dark:bg-[#252830] dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-medium ${
                      active
                        ? 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {typeCounts[kind]}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-48 items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3.5 transition-colors focus-within:border-slate-300 sm:w-56 dark:border-white/10 dark:bg-white/[0.04] dark:focus-within:border-white/25">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索技能"
                className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="relative" ref={createMenuRef}>
              <button
                type="button"
                onClick={() => setShowCreateMenu((prev) => !prev)}
                className="flex h-9 cursor-pointer items-center justify-center rounded-full bg-slate-900 px-4 text-xs font-semibold text-white transition-all hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                <span>创建技能</span>
              </button>

              {showCreateMenu && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-44 rounded-[22px] border border-slate-200/80 bg-white/95 p-2 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-[#22242A]/95 dark:shadow-[0_18px_44px_rgba(0,0,0,0.55)]">
                  <button type="button" onClick={() => { setShowCreateMenu(false); onClose(); onAgentCreate(); }} className="flex w-full cursor-pointer items-center rounded-xl px-4 py-2.5 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100/90 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white"><span>通过Agent创建</span></button>
                  <button type="button" onClick={() => uploadFileInputRef.current?.click()} className="flex w-full cursor-pointer items-center rounded-xl px-4 py-2.5 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100/90 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white"><span>上传本地Skill</span></button>
                  <button type="button" onClick={() => { setShowCreateMenu(false); onClose(); onManualCreate(); }} className="flex w-full cursor-pointer items-center rounded-xl px-4 py-2.5 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100/90 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white"><span>手动创建Skill</span></button>
                </div>
              )}
            </div>

            <button type="button" onClick={onClose} aria-label="关闭技能窗口" className="cursor-pointer rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="shrink-0 px-6 pt-3 pb-2">
          <div className="flex items-center gap-1.5">
            {SKILL_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedTab(tab.key)}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  selectedTab === tab.key
                    ? 'bg-slate-200/90 font-semibold text-slate-900 dark:bg-white/15 dark:text-white'
                    : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-6">
          {presentation === 'creation' ? (
            <div className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSkills.map((skill) => {
                const item = librarySkillItem({ kind: 'assistant', content: skill });
                const isFav = favorites.has(`assistant:${skill.id}`) || favorites.has(skill.id) || Boolean(skill.isFavorite);
                return (
                  <SkillCard
                    key={skill.id}
                    skill={item}
                    isFavorite={isFav}
                    onToggleFavorite={() => handleToggleFavorite(skill)}
                    onUseSkill={() => handleTryNow(skill)}
                    onDetail={() => setSelectedSkillId(skill.id)}
                    onEdit={() => setSelectedSkillId(skill.id)}
                    onDelete={() => { void deleteAssistantSkill(skill.id); }}
                    onFeed={() => {}}
                  />
                );
              })}
              {!filteredSkills.length && <p className="col-span-full py-10 text-center text-xs text-slate-500">暂无匹配的创作技能</p>}
            </div>
          ) : (
            <CodexAgentSkillSection
              skills={filteredSkills}
              activeSkillId={activeAssistantSkillId}
              favorites={favorites}
              grouped={!q && selectedTab === 'all'}
              onSelectSkill={(skill) => setSelectedSkillId(skill.id)}
              onQuickToggleSkill={handleToggleActive}
              onToggleFavorite={handleToggleFavorite}
            />
          )}
        </div>

        {selectedSkill && skillPresentation(selectedSkill) === 'creation' ? (
          <CreationSkillDetailModal
            key={selectedSkill.id}
            item={librarySkillItem({ kind: 'assistant', content: selectedSkill })}
            isFavorite={favorites.has(`assistant:${selectedSkill.id}`) || favorites.has(selectedSkill.id) || Boolean(selectedSkill.isFavorite)}
            onClose={() => setSelectedSkillId(null)}
            onToggleFavorite={() => handleToggleFavorite(selectedSkill)}
            onUse={(initialPromptOverride) => handleTryNow(selectedSkill, initialPromptOverride)}
            showToast={showToast}
          />
        ) : (
          <CodexSkillDetailModal
            usePortal={false}
            skill={selectedSkill}
            isActive={Boolean(selectedSkill && activeAssistantSkillId === selectedSkill.id)}
            onClose={() => setSelectedSkillId(null)}
            onToggleActive={handleToggleActive}
            onTryNow={handleTryNow}
            onDelete={async (skill) => { await deleteAssistantSkill(skill.id); showToast('技能已卸载'); }}
            showToast={showToast}
          />
        )}

        {toastMsg && (
          <div role="status" className="pointer-events-none absolute bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-slate-900">
            {toastMsg}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
