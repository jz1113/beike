import type { VideoSalesCategory } from '@shared/domain/video-sales';
import skillSource from '../../../../../.agents/skills/fashion-video-sales/SKILL.md?raw';

export interface SalesRuleGroup {
  id: 'workflow' | 'fashion';
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

// 界面的两组规则说明，共用现有制作流程，不注册新的生成技能。
export const SALES_RULE_GROUPS: readonly SalesRuleGroup[] = [
  {
    id: 'workflow',
    title: '通用制作流程',
    summary: '确认商品后编排口播分镜，按需生图，再根据实际图片定稿并一次出片。',
    appliesWhen: '全部商品品类',
    input: '商品资料、当前 SKU 颜色与商品图、时长和画幅',
    output: '口播分镜、必要素材、一条完整视频',
    flow: ['确认商品', '编排脚本', '生成素材', '定稿出片'],
    sections: [
      {
        heading: '确认商品与事实',
        body: [
          '先确认当前 SKU 颜色与对应商品图，再设置目标时长、画幅和创作模型；人物与场景按脚本需要自动规划，无需手动凑齐素材。',
          '商品资料是事实依据，创作卖点是模型提炼结果；颜色不明或资料冲突先确认，没有依据的功效、销量、优惠和评价不编造。',
        ],
      },
      {
        heading: '分步确认与整段生成',
        body: [
          '脚本先给出口播、连续时间轴与素材计划。按需生成图片并校验后，再选择兼容的视频模型，根据实际图片定稿完整提示词。',
          '视频模型需支持实际参考图、目标时长与画幅；不兼容时明确调整，不静默丢图、改秒数或拆段拼接。确认后一次生成整段视频。',
        ],
      },
      {
        heading: '费用与恢复',
        body: [
          '分析、素材生成、视频定稿与视频生成分步确认；仅请求分析或提示词时，不擅自调用付费图片或视频生成。',
          '成功素材保留复用，部分失败只补缺失项；已有任务回执先查询，提交结果未确认时不自动重复提交。商品或实际图片变化后检查下游内容并重新定稿。',
        ],
      },
    ],
  },
  {
    id: 'fashion',
    title: '服饰专属规则',
    summary: '在通用流程上，为服饰、鞋、包选择实拍叙事，保持同一人物与单品。',
    appliesWhen: '服饰、鞋、包',
    input: '通用输入；同一颜色的单品图，人物与场景按需生成',
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
