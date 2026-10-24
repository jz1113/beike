interface Props {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categories: string[];
}

/** 仅在存在多个实际有效分类时渲染次级筛选，避免展示无内容的空分类胶囊。 */
export function SkillsCategoryFilter({ selectedCategory, onSelectCategory, categories }: Props) {
  if (categories.length <= 2) return null;
  return (
    <div
      role="tablist"
      aria-label="筛选技能分类"
      className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar"
    >
      {categories.map((category) => {
        const active = selectedCategory === category;
        return (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelectCategory(category)}
            className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-xs transition-all ${
              active
                ? 'bg-slate-200/90 font-semibold text-slate-900 shadow-2xs dark:bg-white/15 dark:text-white'
                : 'border border-slate-200/80 bg-white/70 font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-100/80 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.08] dark:hover:text-white'
            }`}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}
