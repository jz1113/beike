import { useState, useRef, useEffect, useMemo, type ChangeEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { Search, Star, CornerDownLeft, ScanLine } from 'lucide-react';
import { useAppStore } from '@client/store';
import { BUILTIN_ASSISTANT_SKILLS, mergeAssistantSkills } from '@shared/domain/assistant/skills';

const SKILL_TABS = ['全部', '我的', '收藏'] as const;
type SkillTab = (typeof SKILL_TABS)[number];

interface SkillRow {
  id: string;
  title: string;
  description: string;
  isBuiltin: boolean;
}

interface PromptBarSkillsModalProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  isUp?: boolean;
  onUseSkill: (skill: { id: string; title: string }) => void;
  onAgentCreate: () => void;
  onManualCreate: () => void;
  onUploadFiles: (files: File[]) => void;
}

export default function PromptBarSkillsModal({
  isOpen,
  onClose,
  triggerRef,
  isUp = true,
  onUseSkill,
  onAgentCreate,
  onManualCreate,
  onUploadFiles,
}: PromptBarSkillsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedTab, setSelectedTab] = useState<SkillTab>('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  const customSkills = useAppStore((s) => s.assistantCustomSkills);
  const skills: SkillRow[] = useMemo(() => mergeAssistantSkills(customSkills, BUILTIN_ASSISTANT_SKILLS).map((skill) => ({
    id: skill.id,
    title: skill.displayName || skill.name,
    description: skill.description || '自定义技能',
    isBuiltin: Boolean(skill.isBuiltin),
  })), [customSkills]);

  useEffect(() => {
    if (!isOpen) {
      setShowCreateMenu(false);
      return;
    }
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (
        modalRef.current &&
        !modalRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const filteredSkills = skills.filter((skill) => {
    if (selectedTab === '我的' && skill.isBuiltin) return false;
    if (selectedTab === '收藏' && !favorites[skill.id]) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return skill.title.toLowerCase().includes(query) || skill.description.toLowerCase().includes(query);
  });

  const activeSkill = filteredSkills.find((skill) => skill.id === activeSkillId) || null;

  const toggleFavorite = (id: string, event: ReactMouseEvent) => {
    event.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectAndUse = (skill: SkillRow) => {
    onUseSkill({ id: skill.id, title: skill.title });
    onClose();
  };

  const handleUploadLocalSkill = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files;
    const files = selected ? Array.from(selected) : [];
    event.target.value = '';
    if (files.length === 0) return;
    setShowCreateMenu(false);
    onClose();
    onUploadFiles(files);
  };

  return (
    <div
      ref={modalRef}
      className={`absolute left-1/2 z-50 w-[520px] max-w-[calc(100vw-2rem)] -translate-x-1/2 select-none rounded-3xl border border-slate-200/90 bg-white/98 p-4 text-left text-slate-900 shadow-[0_20px_50px_rgba(0,0,0,0.16)] backdrop-blur-2xl animate-fade-in dark:border-white/10 dark:bg-[#18191c]/95 dark:text-slate-100 ${
        isUp ? 'bottom-full mb-2.5 origin-bottom' : 'top-full mt-2.5 origin-top'
      }`}
    >
      <input
        type="file"
        ref={uploadFileInputRef}
        onChange={handleUploadLocalSkill}
        accept=".md,.txt,.zip,text/markdown,application/zip"
        multiple
        className="hidden"
      />

      <div className="flex items-center border-b border-slate-100 pb-3 dark:border-white/10">
        <div className="flex w-full items-center gap-2 rounded-full bg-slate-100/90 px-3.5 py-2 text-sm text-slate-700 dark:bg-white/10 dark:text-slate-200">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            placeholder="搜索技能"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full border-0 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-[148px_minmax(0,1fr)] gap-3 pt-3">
        <div className="space-y-1 border-r border-slate-100 pr-2 dark:border-white/10">
          {SKILL_TABS.map((tab) => {
            const isSelected = selectedTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setSelectedTab(tab)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-slate-100 font-semibold text-slate-950 dark:bg-white/10 dark:text-slate-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white'
                }`}
              >
                <span>{tab}</span>
              </button>
            );
          })}
        </div>

        <div className="flex min-h-[168px] flex-col">
          {filteredSkills.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              还没有技能
            </div>
          ) : (
            <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
              {filteredSkills.map((skill) => {
                const isActive = activeSkill?.id === skill.id;
                return (
                  <div
                    key={skill.id}
                    onClick={() => setActiveSkillId(skill.id)}
                    onDoubleClick={() => handleSelectAndUse(skill)}
                    className={`cursor-pointer rounded-2xl border p-2.5 transition-all ${
                      isActive
                        ? 'border-slate-300 bg-slate-100/80 dark:border-white/15 dark:bg-white/10'
                        : 'border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="line-clamp-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {skill.title}
                      </span>
                      <div className="flex shrink-0 items-center">
                        <button
                          type="button"
                          onClick={(event) => toggleFavorite(skill.id, event)}
                          title={favorites[skill.id] ? '取消收藏' : '收藏'}
                          className={`cursor-pointer rounded-md p-1 ${
                            favorites[skill.id] ? 'text-amber-500' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          <Star className={`h-3.5 w-3.5 ${favorites[skill.id] ? 'fill-current' : ''}`} />
                        </button>
                        {isActive && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSelectAndUse(skill);
                            }}
                            title="使用此技能"
                            className="cursor-pointer rounded-md p-1 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                          >
                            <CornerDownLeft className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {skill.description}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="relative mt-auto flex justify-end border-t border-slate-200/60 pt-3 dark:border-white/10">
            <button
              type="button"
              onClick={() => setShowCreateMenu(!showCreateMenu)}
              className="flex cursor-pointer items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white shadow-xs transition-all hover:bg-black active:scale-95 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <ScanLine className="h-4 w-4" />
              <span>创建技能</span>
            </button>

            {showCreateMenu && (
              <div className="absolute bottom-full right-0 z-50 mb-2 w-44 space-y-1 rounded-2xl border border-slate-200/90 bg-white p-2 text-left shadow-[0_12px_32px_rgba(0,0,0,0.18)] animate-fade-in dark:border-white/10 dark:bg-[#18191c]">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateMenu(false);
                    onClose();
                    onAgentCreate();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <span>通过Agent创建</span>
                </button>
                <button
                  type="button"
                  onClick={() => uploadFileInputRef.current?.click()}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <span>上传本地Skill</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateMenu(false);
                    onClose();
                    onManualCreate();
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <span>手动创建Skill</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
