import { Shirt } from 'lucide-react';
import { SkillGuideDialog, type SkillGuideItem } from '@client/shared/ui/SkillGuideDialog';
import { SALES_RULE_GROUPS, SALES_SKILL_DOCUMENT, salesSkillBadge } from '../model/fashionSalesSkill';

interface Props {
  active: boolean;
  onClose: () => void;
}

export function FashionSkillSheet({ active, onClose }: Props) {
  const items: SkillGuideItem[] = SALES_RULE_GROUPS.map((group) => ({
    ...group,
    mark: <Shirt className="h-4 w-4" aria-hidden />,
    badge: { label: salesSkillBadge(active), tone: active ? 'ready' : 'muted' },
    document: SALES_SKILL_DOCUMENT,
  }));

  return (
    <SkillGuideDialog
      title="带货规则"
      status="服饰、鞋、包使用实拍叙事，保持同一人物与单品。"
      items={items}
      layout="compact"
      detailMode="page"
      onClose={onClose}
    />
  );
}
