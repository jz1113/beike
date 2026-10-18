import { Brush, ShoppingBag, FilePen, Download, ScanFace, Captions, FileType } from 'lucide-react';
import { SpotlightCard } from '@client/shared/ui/SpotlightCard';

interface Props {
  onEnterWorkshop: () => void;
  onOpenHeadlinePoster: () => void;
  onOpenKeywordReview: () => void;
  onOpenPptGenerator?: () => void;
  onOpenAvatarStudio?: () => void;
  onOpenVideoSales?: () => void;
  onOpenCollectorHub?: () => void;
  onPlaceholderClick?: (title: string) => void;
}

const capsules = [
  { id: 'headline_poster', title: '封面生成', hint: '商品与标题，一次生成吸睛封面', icon: Brush },
  { id: 'workshop', title: '电商工坊', hint: '从灵感到批量成片的一站式创作', icon: ShoppingBag },
  { id: 'digital_human', title: '数字人', hint: '高颜值数字人克隆与口播视频生成', icon: ScanFace },
  { id: 'video_sales', title: '视频带货', hint: '上传商品图，AI 自动生成短视频带货脚本与成片', icon: Captions },
  { id: 'keyword_review', title: '词包审核', hint: '批量语义分类，审核内容是否值得制作', icon: FilePen },
  { id: 'ppt_generator', title: 'PPT生成', hint: '一句话/大纲，AI 视觉渲染高保真演示文稿', icon: FileType },
  { id: 'collector_hub', title: '内容采集', hint: '聚合商品与社媒内容，沉淀可用素材库', icon: Download },
] as const;

export default function FeatureCapsules({
  onEnterWorkshop,
  onOpenHeadlinePoster,
  onOpenKeywordReview,
  onOpenPptGenerator,
  onOpenAvatarStudio,
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
    ppt_generator: onOpenPptGenerator || (() => handlePlaceholder('PPT生成')),
    collector_hub: onOpenCollectorHub || (() => {}),
    digital_human: onOpenAvatarStudio || (() => handlePlaceholder('数字人')),
    video_sales: onOpenVideoSales || (() => handlePlaceholder('视频带货')),
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
