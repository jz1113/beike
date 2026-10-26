import { AssistantSkillCardIcon } from '@client/shared/icons';
import { SkillGuideDialog, type SkillGuideItem } from '@client/shared/ui/SkillGuideDialog';
import { SALES_RULE_GROUPS, SALES_SKILL_DOCUMENT, salesSkillBadge } from '../model/fashionSalesSkill';

interface Props {
  active: boolean;
  onClose: () => void;
}

export function FashionSkillSheet({ active, onClose }: Props) {
  const items: SkillGuideItem[] = SALES_RULE_GROUPS.map((group) => ({
    ...group,
    mark: <AssistantSkillCardIcon skill={{ icon: 'shirt' }} />,
    badge: { label: salesSkillBadge(active), tone: active ? 'ready' : 'muted' },
    document: SALES_SKILL_DOCUMENT,
  }));

  return (
    <SkillGuideDialog
      title="带货规则"
      status="查看已接入的带货技能与制作规范。"
      items={items}
      layout="compact"
      detailMode="page"
      onClose={onClose}
    />
  );
}
