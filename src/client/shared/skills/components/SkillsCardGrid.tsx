import type { ComponentProps, ReactNode } from 'react';
import type { SkillItem } from '../model/skillTypes';
import { SkillCard } from './SkillCard';
import { SkillsEmptyState } from './SkillsEmptyState';

interface Props extends Omit<ComponentProps<typeof SkillCard>, 'skill' | 'isFavorite'> {
  skills: SkillItem[];
  favorites: Set<string>;
  emptyMessage?: string;
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
  createTile?: ReactNode;
}

export function SkillsCardGrid({
  skills,
  favorites,
  emptyMessage,
  onEmptyAction,
  emptyActionLabel,
  createTile,
  ...actions
}: Props) {
  if (skills.length === 0) {
    return <SkillsEmptyState message={emptyMessage} onAction={onEmptyAction} actionLabel={emptyActionLabel} />;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] items-start gap-x-5 gap-y-7">
      {skills.map((skill) => (
        <SkillCard key={skill.id} skill={skill} isFavorite={favorites.has(skill.id)} {...actions} />
      ))}
      {createTile}
    </div>
  );
}
