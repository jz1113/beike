import workshopBackground from '@client/assets/home/tool-workshop-background.jpg';
import headlineBackground from '@client/assets/home/tool-headline-background.jpg';
import collectorBackground from '@client/assets/home/tool-collector-background.jpg';
import keywordReviewBackground from '@client/assets/home/tool-keyword-review-background.jpg';
import TiltedCard from '@client/shared/ui/TiltedCard';

interface Props {
  onEnterWorkshop: () => void;
  onOpenHeadlinePoster: () => void;
  onOpenKeywordReview: () => void;
  onOpenCollectorHub?: () => void;
}

type VisualKind = 'workshop' | 'headline' | 'collector' | 'keyword';

type ToolCard = {
  id: string;
  title: string;
  displayName: string;
  subtitle: string;
  actionLabel: string;
  tone: string;
  titleClass: string;
  titleSizeClass?: string;
  displayClass: string;
  subtitleClass: string;
  contentWidth: string;
  visual: VisualKind;
  action: () => void;
};

const toolBackgrounds: Record<VisualKind, string> = {
  workshop: workshopBackground,
  headline: headlineBackground,
  collector: collectorBackground,
  keyword: keywordReviewBackground,
};

/**
 * 入口按 16:9 素材比例设计。每张卡的配色、构图和字形都服务于对应工具，
 * 文案由真实 HTML 叠加，避免把可读性寄托在生图模型的文字能力上。
 */
export default function FeatureCapsules({
  onEnterWorkshop,
  onOpenHeadlinePoster,
  onOpenKeywordReview,
  onOpenCollectorHub,
}: Props) {
  const capsules: ToolCard[] = [
    {
      id: 'headline_poster', title: '大字报生成', displayName: 'COVER EDITORIAL', subtitle: '商品与标题，一次生成吸睛封面', actionLabel: '制作封面',
      tone: 'from-[#fbf4e6]/98 via-[#ead8bd]/82 to-transparent', titleClass: 'font-black tracking-[-0.035em] text-[#25262f]', displayClass: 'text-[#a33f32]', subtitleClass: 'text-[#655953]', contentWidth: 'max-w-[63%]', visual: 'headline', action: onOpenHeadlinePoster,
    },
    {
      id: 'workshop', title: '种草工坊', displayName: 'ORIGINAL STUDIO', subtitle: '从灵感到批量成片的一站式创作', actionLabel: '开始创作',
      tone: 'from-[#06120f]/96 via-[#0d2922]/78 to-transparent', titleClass: 'font-bold tracking-[0.06em] text-[#fffaf0]', displayClass: 'text-[#f5e4be]', subtitleClass: 'text-[#eef7e8]/72', contentWidth: 'max-w-[65%]', visual: 'workshop', action: onEnterWorkshop,
    },
    {
      id: 'keyword_review', title: '关键词分类及制作判断', displayName: 'SEMANTIC REVIEW', subtitle: '批量语义分类，审核内容是否值得制作', actionLabel: '导入表格',
      tone: 'from-[#241309]/98 via-[#5f3414]/88 to-[#091d24]/20', titleClass: 'font-black tracking-[-0.025em] text-[#fffaf0]', titleSizeClass: 'text-[15px] sm:text-[16px] 2xl:text-[18px]', displayClass: 'text-[#ffc66d]', subtitleClass: 'text-[#fff4db]/72', contentWidth: 'max-w-[96%]', visual: 'keyword', action: onOpenKeywordReview,
    },
    {
      id: 'collector_hub', title: '全渠道智能采集', displayName: 'ASSET INTELLIGENCE', subtitle: '聚合商品与社媒内容，沉淀可用素材库', actionLabel: '浏览素材',
      tone: 'from-[#062029]/98 via-[#0d3a46]/84 to-transparent', titleClass: 'font-bold tracking-[0.015em] text-[#f2fffa]', displayClass: 'text-[#bce9db]', subtitleClass: 'text-[#d7f2ea]/70', contentWidth: 'max-w-[68%]', visual: 'collector', action: onOpenCollectorHub || (() => {}),
    },
  ];

  return (
    <section aria-label="创作工具" className="relative z-10">
      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {capsules.map((item) => (
          <button key={item.id} type="button" onClick={item.action} className="group isolate block aspect-video min-w-0 w-full appearance-none border-0 bg-transparent p-0 text-left shadow-none outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2" aria-label={`${item.title}：${item.actionLabel}`}>
            <TiltedCard
              imageSrc={toolBackgrounds[item.visual]}
              altText=""
              containerHeight="100%"
              containerWidth="100%"
              imageHeight="100%"
              imageWidth="100%"
              scaleOnHover={1.035}
              rotateAmplitude={5}
              showMobileWarning={false}
              showTooltip={false}
              displayOverlayContent
              overlayContent={
                <>
                  <div className={`absolute inset-0 bg-gradient-to-r ${item.tone}`} />
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.13)_0%,transparent_34%,rgba(255,255,255,0.04)_68%,transparent_100%)]" />
                  <div className="relative flex h-full flex-col justify-end p-4 sm:p-5 lg:p-6">
                    <div className={item.contentWidth}>
                      <h3 className={`${item.titleSizeClass || 'text-[18px] sm:text-[19px] 2xl:text-[21px]'} leading-tight drop-shadow-sm ${item.titleClass}`}>{item.title}</h3>
                      <p className={`mt-0.5 font-serif text-[18px] font-semibold italic leading-tight tracking-[-0.035em] sm:text-[19px] 2xl:text-[21px] ${item.displayClass}`}>{item.displayName}</p>
                      <p className={`mt-1.5 line-clamp-1 text-[11px] leading-relaxed sm:text-[12px] ${item.subtitleClass}`}>{item.subtitle}</p>
                    </div>
                  </div>
                </>
              }
            />
          </button>
        ))}
      </div>
    </section>
  );
}
