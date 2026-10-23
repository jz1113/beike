import type { VideoSalesCategory } from '@shared/domain/sales';
import skillSource from '../../../../../.agents/skills/fashion-video-sales/SKILL.md?raw';

export interface SalesRuleGroup {
  id: 'fashion';
  title: string;
  summary: string;
  appliesWhen: string;
  input: string;
  output: string;
  flow: readonly string[];
  sections: readonly { heading: string; body: readonly string[] }[];
}

export const SALES_SKILL_DOCUMENT = {
  name: 'fashion-video-sales',
  filename: 'SKILL.md',
  source: skillSource,
  body: skillSource.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim(),
};

// 规则弹窗只展示已接入的服饰技能。通用制作流程仍保留在创作设置中。
export const SALES_RULE_GROUPS: readonly SalesRuleGroup[] = [
  {
    id: 'fashion',
    title: '服饰专属规则',
    summary: '为服饰、鞋、包选择实拍叙事，保持同一人物与单品。',
    appliesWhen: '服饰、鞋、包',
    input: '商品资料、同一颜色的单品图、时长和画幅；人物与场景按需生成',
    output: '连贯实拍方案与一条完整视频',
    flow: ['选择叙事', '保持一致', '实图定稿', '整段出片'],
    sections: [],
  },
];

export type SalesSkillId = 'generic' | 'fashion';

export const SALES_SKILL_OPTIONS: readonly { id: SalesSkillId; label: string }[] = [
  { id: 'generic', label: '通用制作流程' },
  { id: 'fashion', label: '服饰专属规则' },
];

export function salesSkillId(category: VideoSalesCategory): SalesSkillId {
  return category === 'fashion' ? 'fashion' : 'generic';
}

export function salesCategoryForSkill(skill: SalesSkillId): VideoSalesCategory {
  return skill === 'fashion' ? 'fashion' : 'other';
}

export function salesSkillBadge(fashionActive: boolean): string {
  return fashionActive ? '当前适用' : '服饰鞋包适用';
}

export function salesCreationRule(category: VideoSalesCategory): { title: string; detail: string } {
  if (category === 'fashion') {
    return { title: '服饰专属规则', detail: '本次商品分析与口播按服饰、鞋、包的实拍叙事编写：开箱换装、生活穿搭或鞋包展示。' };
  }
  return { title: '通用制作流程', detail: '本次商品分析与口播按全品类通用流程编写。' };
}
