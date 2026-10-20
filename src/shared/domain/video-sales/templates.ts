import type { VideoSalesCategory, VideoSalesShot } from './types';

export const VIDEO_SALES_CATEGORY_LABELS: Record<VideoSalesCategory, string> = {
  beauty: '美妆护肤',
  food: '食品零食',
  home: '家居日用',
  fashion: '服饰鞋包',
  tech: '数码3C',
  other: '通用百货',
};

export const VIDEO_SALES_SHOT_TYPE_CONFIG: Record<
  VideoSalesShot['type'],
  { label: string; badgeClass: string; desc: string }
> = {
  hook: { label: '前3秒钩子', badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20', desc: '强冲击/悬念提问抓眼球' },
  pain_point: { label: '痛点放大', badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20', desc: '生活场景痛点唤醒共鸣' },
  product_reveal: { label: '产品登场', badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20', desc: '救星亮相与卖点呈现' },
  demo: { label: '实测演示', badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', desc: '硬核功能与真实使用过程' },
  social_proof: { label: '信任背书', badgeClass: 'bg-purple-500/10 text-purple-500 border-purple-500/20', desc: '销量/口碑/权威认证' },
  cta: { label: '促单转化', badgeClass: 'bg-orange-500/10 text-orange-500 border-orange-500/20', desc: '限时优惠逼单转化' },
};
