import { ListChecks, Radar, Sparkles, Type } from 'lucide-react';

interface Props {
  onEnterWorkshop: () => void;
  onOpenHeadlinePoster: () => void;
  onOpenKeywordReview: () => void;
  onOpenCollectorHub?: () => void;
}

const capsules = [
  { id: 'headline_poster', title: '大字报', hint: '商品与标题，一次生成吸睛封面', icon: Type },
  { id: 'workshop', title: '种草工坊', hint: '从灵感到批量成片的一站式创作', icon: Sparkles },
  { id: 'keyword_review', title: '关键词审核', hint: '批量语义分类，审核内容是否值得制作', icon: ListChecks },
  { id: 'collector_hub', title: '智能采集', hint: '聚合商品与社媒内容，沉淀可用素材库', icon: Radar },
] as const;

export default function FeatureCapsules({
  onEnterWorkshop,
  onOpenHeadlinePoster,
  onOpenKeywordReview,
  onOpenCollectorHub,
}: Props) {
  const actions: Record<(typeof capsules)[number]['id'], () => void> = {
    headline_poster: onOpenHeadlinePoster,
    workshop: onEnterWorkshop,
    keyword_review: onOpenKeywordReview,
    collector_hub: onOpenCollectorHub || (() => {}),
  };

  return (
    <section aria-label="创作工具" className="relative z-10">
      <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-4 sm:gap-x-8">
        {capsules.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={actions[item.id]}
              title={item.hint}
              aria-label={`${item.title}：${item.hint}`}
              className="group flex w-[4.75rem] flex-col items-center gap-2 border-0 bg-transparent p-0 text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80 transition group-hover:bg-slate-50 group-hover:text-slate-950">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="text-center text-[12px] leading-4 text-slate-500 group-hover:text-slate-800">{item.title}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
