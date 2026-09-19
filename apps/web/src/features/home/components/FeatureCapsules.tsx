import { GrassWorkshopIcon, CollectorHubIcon, ReplicationIcon } from '@/shared/icons';

interface Props {
  onEnterWorkshop: () => void;
  onEnterReplication: () => void;
  onOpenCollectorHub?: () => void;
}

export default function FeatureCapsules({
  onEnterWorkshop,
  onEnterReplication,
  onOpenCollectorHub,
}: Props) {
  const capsules = [
    {
      id: 'workshop',
      customIcon: (
        <div className="w-5.5 h-5.5 sm:w-6 sm:h-6 rounded-lg overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform flex items-center justify-center p-0.5 bg-white border border-slate-100">
          <GrassWorkshopIcon className="w-full h-full" />
        </div>
      ),
      title: '种草工坊',
      subtitle: '原创批量 · 五步全套闭环',
      action: onEnterWorkshop,
      isReady: true,
    },
    {
      id: 'replication',
      customIcon: (
        <ReplicationIcon className="w-5.5 h-5.5 sm:w-6 sm:h-6 flex-shrink-0 group-hover:scale-105 transition-transform" />
      ),
      title: '爆款复刻',
      subtitle: '对标爆款 · 五步出图闭环',
      action: onEnterReplication,
      isReady: true,
    },
    {
      id: 'collector_hub',
      customIcon: (
        <div className="w-5.5 h-5.5 sm:w-6 sm:h-6 flex-shrink-0 group-hover:scale-105 transition-transform">
          <CollectorHubIcon className="w-full h-full" />
        </div>
      ),
      title: '全渠道智能采集',
      subtitle: '万邦电商 · 社媒无水印图集',
      action: onOpenCollectorHub || (() => {}),
      isReady: true,
    },
  ];

  return (
    <div className="w-full relative z-10">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 w-full">
        {capsules.map((item) => (
          <div
            key={item.id}
            onClick={item.action}
            className={`w-full min-w-0 py-2.5 px-3.5 sm:py-3 sm:px-4 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all flex items-center gap-2.5 sm:gap-3 cursor-pointer group select-none ${
              item.isReady
                ? 'hover:border-slate-300 hover:bg-slate-50/80'
                : 'hover:border-slate-300 opacity-90'
            }`}
          >
            {item.customIcon}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-[13.5px] font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate whitespace-nowrap">
                  {item.title}
                </span>
                {item.isReady && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                )}
              </div>
              <div className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5 font-normal">
                {item.subtitle}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
