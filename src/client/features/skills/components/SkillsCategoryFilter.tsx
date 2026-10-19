import { SKILL_CATEGORIES, SKILL_TAG_OPTIONS } from '@client/shared/skills';

interface SkillsCategoryFilterProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export function SkillsCategoryFilter({
  selectedCategory,
  onSelectCategory,
}: SkillsCategoryFilterProps) {
  if (SKILL_TAG_OPTIONS.length === 0) return null;

  return (
    <div className="flex w-full items-center gap-2 overflow-x-auto px-6 py-3.5 md:px-8 no-scrollbar">
      {SKILL_CATEGORIES.map((cat) => {
        const isSelected = selectedCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onSelectCategory(cat)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-colors cursor-pointer select-none ${
              isSelected
                ? 'bg-slate-200/80 dark:bg-white/15 text-slate-900 dark:text-white font-medium shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/5'
            }`}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
