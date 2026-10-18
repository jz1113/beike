interface SkillsEmptyStateProps {
  message?: string;
}

export function SkillsEmptyState({ message = '暂无技能' }: SkillsEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[420px] select-none">
      <span className="text-[13px] tracking-wide text-slate-400 dark:text-[#8E8E93]">
        {message}
      </span>
    </div>
  );
}
