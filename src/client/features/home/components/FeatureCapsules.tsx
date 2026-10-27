import { Brush, ShoppingBag, FilePen, Download, ScanFace, Captions, FileType } from 'lucide-react';
import { SpotlightCard } from '@client/shared/ui/SpotlightCard';

interface Props {
  onEnterWorkshop: () => void;
  onOpenHeadlinePoster: () => void;
  onOpenKeywordReview: () => void;
  onOpenVideoSales?: () => void;
  onOpenCollectorHub?: () => void;
  onPlaceholderClick?: (title: string) => void;
}

const capsules = [
  { id: 'video_sales', title: '电商视频', hint: '贴商品链接，采集图文后生成无字幕电商视频', icon: Captions },
  { id: 'workshop', title: '电商图文', hint: '从商品到批量图文的一站式创作', icon: ShoppingBag },
  { id: 'headline_poster', title: '封面', hint: '商品与标题，一次生成吸睛封面', icon: Brush },
  { id: 'keyword_review', title: '词包', hint: '批量语义分类，审核内容是否值得制作', icon: FilePen },
  { id: 'digital_human', title: '数字人', hint: '功能重建中', icon: ScanFace },
  { id: 'ppt_generator', title: 'PPT', hint: '功能重建中', icon: FileType },
  { id: 'collector_hub', title: '采集', hint: '聚合商品与社媒内容，沉淀可用素材库', icon: Download },
] as const;

export default function FeatureCapsules({
  onEnterWorkshop,
  onOpenHeadlinePoster,
  onOpenKeywordReview,
  onOpenVideoSales,
  onOpenCollectorHub,
  onPlaceholderClick,
}: Props) {
  const handlePlaceholder = (title: string) => {
    onPlaceholderClick?.(title);
  };

  const actions: Record<(typeof capsules)[number]['id'], () => void> = {
    headline_poster: onOpenHeadlinePoster,
    workshop: onEnterWorkshop,
    keyword_review: onOpenKeywordReview,
    ppt_generator: () => handlePlaceholder('PPT'),
    collector_hub: onOpenCollectorHub || (() => handlePlaceholder('采集')),
    digital_human: () => handlePlaceholder('数字人'),
    video_sales: onOpenVideoSales || (() => handlePlaceholder('电商视频')),
  };

  return (
    <section aria-label="创作工具" className="relative z-10">
      <div className="flex flex-wrap items-start justify-center gap-x-8 gap-y-4 sm:gap-x-10">
        {capsules.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={actions[item.id]}
              title={item.hint}
              aria-label={`${item.title}：${item.hint}`}
              className="group flex w-[4.75rem] flex-col items-center gap-2 border-0 bg-transparent p-0 text-slate-600 dark:text-slate-300 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 cursor-pointer transition-transform duration-200 active:scale-95"
            >
              <SpotlightCard
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-xs ring-1 ring-black/[0.06] transition-all duration-300 group-hover:scale-105 group-hover:shadow-md dark:bg-[#1B1B1E] dark:ring-white/[0.08] dark:shadow-none"
                spotlightColor="rgba(255, 255, 255, 0.08)"
              >
                <Icon className="h-6 w-6 text-slate-800 dark:text-[#E5E5EA] transition-transform duration-300 group-hover:scale-110 stroke-[2]" />
              </SpotlightCard>
              <span className="text-center text-[12px] leading-4 text-slate-500 transition-colors duration-200 group-hover:text-slate-900 dark:text-[#8E8E93] dark:group-hover:text-[#EDEDED] font-medium">
                {item.title}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
