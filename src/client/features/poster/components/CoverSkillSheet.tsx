import { Brush, Layers } from 'lucide-react';
import { SkillGuideDialog, type SkillGuideItem } from '@client/shared/ui/SkillGuideDialog';
import { COVER_SKILLS, coverSkillMemoryStatus, type CoverSkill } from '../model/coverSkills';

interface Props {
  adoptedCount: number;
  pendingCount: number;
  onClose: () => void;
}

export function CoverSkillSheet({ adoptedCount, pendingCount, onClose }: Props) {
  const memory = coverSkillMemoryStatus(adoptedCount, pendingCount);
  const items: SkillGuideItem[] = COVER_SKILLS.map((skill) => ({
    id: skill.id,
    title: skill.title,
    summary: skill.summary,
    appliesWhen: skill.appliesWhen,
    input: skill.input,
    output: skill.output,
    flow: skill.flow,
    sections: skill.sections,
    mark: coverMark(skill.id),
  }));

  return (
    <SkillGuideDialog title="封面规则" status={memory.summary} note={memory.note} items={items} layout="grid" onClose={onClose} />
  );
}

function coverMark(id: CoverSkill['id']) {
  const className = 'h-5 w-5';
  if (id === 'generate') return <Brush className={className} aria-hidden />;
  return <Layers className={className} aria-hidden />;
}
