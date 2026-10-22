import type { SkillItem } from '../model/skillTypes';
import { SkillCard } from './SkillCard';
import { SkillsEmptyState } from './SkillsEmptyState';

interface SkillsCardGridProps {
  skills: SkillItem[];
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onUseSkill: (skill: SkillItem) => void;
  emptyMessage?: string;
  onDetail: (skill: SkillItem) => void;
  onEdit: (skill: SkillItem) => void;
  onDelete: (skill: SkillItem) => void;
  onFeed: (skill: SkillItem) => void;
}

export function SkillsCardGrid({
  skills,
  favorites,
  onToggleFavorite,
  onUseSkill,
  emptyMessage,
  onDetail, onEdit, onDelete, onFeed,
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
          onDetail={onDetail} onEdit={onEdit} onDelete={onDelete} onFeed={onFeed}
        />
      ))}
    </div>
  );
}
