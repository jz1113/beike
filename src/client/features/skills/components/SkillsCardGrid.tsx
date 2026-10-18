import type { SkillItem } from '@client/shared/skills';
import { SkillCard } from './SkillCard';
import { SkillsEmptyState } from './SkillsEmptyState';

interface SkillsCardGridProps {
  skills: SkillItem[];
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onUseSkill: (skill: SkillItem) => void;
  emptyMessage?: string;
}

export function SkillsCardGrid({
  skills,
  favorites,
  onToggleFavorite,
  onUseSkill,
  emptyMessage,
}: SkillsCardGridProps) {
  if (skills.length === 0) {
    return <SkillsEmptyState message={emptyMessage} />;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-7 px-6 py-4 md:px-8">
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          isFavorite={favorites.has(skill.id)}
          onToggleFavorite={onToggleFavorite}
          onUseSkill={onUseSkill}
        />
      ))}
    </div>
  );
}
