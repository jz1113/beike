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
  hook: { label: '自然开场', badgeClass: 'bg-rose-500/10 text-rose-500 border-rose-500/20', desc: '以具体场合或一件事开口' },
  detail: { label: '商品展示', badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20', desc: '展示资料或图片中可见的商品事实' },
  closing: { label: '自然收尾', badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', desc: '说清穿搭建议或适用场合' },
  pain_point: { label: '使用场景', badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20', desc: '已有资料支持的场合与需求' },
  product_reveal: { label: '商品呈现', badgeClass: 'bg-blue-500/10 text-blue-500 border-blue-500/20', desc: '当前这一件商品与已知卖点' },
  demo: { label: '展示过程', badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', desc: '按脚本自然展示，不编造实测结果' },
  social_proof: { label: '资料依据', badgeClass: 'bg-purple-500/10 text-purple-500 border-purple-500/20', desc: '仅使用有明确资料支持的信息' },
  cta: { label: '收尾建议', badgeClass: 'bg-orange-500/10 text-orange-500 border-orange-500/20', desc: '自然穿搭建议，不编造优惠与购买链接' },
};
