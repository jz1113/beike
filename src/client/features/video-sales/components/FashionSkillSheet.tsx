import { Clapperboard, Shirt } from 'lucide-react';
import { SkillGuideDialog, type SkillGuideItem } from '@client/shared/ui/SkillGuideDialog';
import { SALES_RULE_GROUPS, SALES_SKILL_DOCUMENT, salesSkillBadge } from '../model/fashionSalesSkill';

interface Props {
  active: boolean;
  onClose: () => void;
}

export function FashionSkillSheet({ active, onClose }: Props) {
  const items: SkillGuideItem[] = SALES_RULE_GROUPS.map((group) => ({
    ...group,
    mark: group.id === 'workflow' ? <Clapperboard className="h-5 w-5" aria-hidden /> : <Shirt className="h-5 w-5" aria-hidden />,
    badge: group.id === 'workflow'
      ? { label: '全品类', tone: 'muted' }
      : { label: salesSkillBadge(active), tone: active ? 'ready' : 'muted' },
    document: group.id === 'fashion' ? SALES_SKILL_DOCUMENT : undefined,
  }));

  return (
    <SkillGuideDialog
      title="带货规则"
      status="全品类共用制作流程，服饰鞋包补充专属叙事与一致性规则。"
      items={items}
      layout="grid"
      onClose={onClose}
    />
  );
}
