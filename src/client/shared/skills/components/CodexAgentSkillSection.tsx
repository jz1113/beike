import { Check, Pin, Star } from 'lucide-react';
import { AssistantSkillCardIcon } from '@client/shared/icons';
import { groupAssistantSkillsByCategory, type AssistantSkill } from '@shared/domain/assistant/skills';
import { assistantSkillTitle } from './CodexSkillDetailModal';

export interface CodexAgentSkillSectionProps {
  skills: AssistantSkill[];
  activeSkillId: string | null;
  favorites?: Set<string>;
  onSelectSkill: (skill: AssistantSkill) => void;
  onQuickToggleSkill?: (skill: AssistantSkill) => void;
  onToggleFavorite?: (skill: AssistantSkill) => void;
  grouped?: boolean;
  compact?: boolean;
}

function SkillRowItem({
  skill,
  isActive,
  isFavorite,
  onSelect,
  onQuickToggle,
  onToggleFavorite,
  compact,
}: {
  skill: AssistantSkill;
  isActive: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onQuickToggle?: () => void;
  onToggleFavorite?: () => void;
  compact?: boolean;
}) {
  const title = assistantSkillTitle(skill);

  return (
    <div className={`group flex items-center gap-2 rounded-xl px-3 transition-colors ${compact ? 'py-3' : 'py-3.5'} ${isActive ? 'bg-blue-50/60 dark:bg-blue-500/[0.06]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'}`}>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3.5 rounded-lg text-left outline-offset-4 focus-visible:outline-2 focus-visible:outline-blue-500">
        <AssistantSkillCardIcon skill={skill} size={compact ? 'sm' : 'md'} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-medium text-slate-900 dark:text-slate-100">{title}</span>
          </span>
          <span className="mt-1 block truncate text-[13px] leading-5 text-slate-500 dark:text-slate-400" title={skill.description}>{skill.description || '暂无描述'}</span>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={isFavorite ? '取消收藏' : '收藏技能'}
            aria-pressed={isFavorite}
            title={isFavorite ? '取消收藏' : '收藏技能'}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-opacity ${
              isFavorite
                ? 'text-amber-500 opacity-100'
                : 'text-slate-400 opacity-0 hover:bg-slate-200/70 hover:text-slate-700 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 dark:hover:bg-white/10 dark:hover:text-slate-200'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        )}

        {onQuickToggle && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onQuickToggle();
            }}
            aria-label={isActive ? `取消本次指定 ${title}` : `本次指定 ${title}`}
            aria-pressed={isActive}
            title={isActive ? '取消本次指定；仍可自动调用' : '仅为本次消息指定此运行技能'}
            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors ${
              isActive
                ? 'text-blue-500 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-500/10'
                : 'text-slate-300 hover:bg-slate-200/70 hover:text-slate-800 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-white'
            }`}
          >
            {isActive ? <Check className="h-4 w-4" strokeWidth={2.2} /> : <Pin className="h-4 w-4" strokeWidth={1.9} />}
          </button>
        )}
      </div>
    </div>
  );
}

export function CodexAgentSkillSection({
  skills,
  activeSkillId,
  favorites,
  onSelectSkill,
  onQuickToggleSkill,
  onToggleFavorite,
  grouped = true,
  compact = false,
}: CodexAgentSkillSectionProps) {
  if (skills.length === 0) {
    return (
      <div className="py-16 text-center text-xs text-slate-400 dark:text-slate-500">
        暂无匹配的 Agent 运行技能
      </div>
    );
  }

  if (!grouped) {
    return (
      <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {skills.map((skill) => (
          <SkillRowItem
            key={skill.id}
            skill={skill}
            isActive={activeSkillId === skill.id}
            isFavorite={Boolean(favorites?.has(`assistant:${skill.id}`) || favorites?.has(skill.id) || skill.isFavorite)}
            onSelect={() => onSelectSkill(skill)}
            onQuickToggle={onQuickToggleSkill ? () => onQuickToggleSkill(skill) : undefined}
            onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(skill) : undefined}
            compact={compact}
          />
        ))}
      </div>
    );
  }

  const sections = groupAssistantSkillsByCategory(skills);

  return (
    <div className="space-y-7">
      {sections.map((section) => (
        <section key={section.category} className="space-y-2">
          <div className="flex items-center gap-3 px-3">
            <h4 className="shrink-0 text-[11px] font-medium tracking-wide text-slate-400 dark:text-slate-500">
              {section.category}
            </h4>
            <span className="h-px flex-1 bg-slate-100 dark:bg-white/[0.05]" />
            <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">{section.skills.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2">
            {section.skills.map((skill) => (
              <SkillRowItem
                key={skill.id}
                skill={skill}
                isActive={activeSkillId === skill.id}
                isFavorite={Boolean(favorites?.has(`assistant:${skill.id}`) || favorites?.has(skill.id) || skill.isFavorite)}
                onSelect={() => onSelectSkill(skill)}
                onQuickToggle={onQuickToggleSkill ? () => onQuickToggleSkill(skill) : undefined}
                onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(skill) : undefined}
                compact={compact}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
