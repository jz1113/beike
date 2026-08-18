'use client';
import { useState } from 'react';
import { GrassWorkshopIcon, CollectorHubIcon, MannequinFittingIcon, SuperResolution4KIcon } from '@/components/common/BrandIcons';
import { Sparkles, CheckCircle2 } from 'lucide-react';

interface Props {
  onEnterBuyerShow: () => void;
  onOpenCollectorHub?: () => void;
}

export default function FeatureCapsules({ onEnterBuyerShow, onOpenCollectorHub }: Props) {
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const capsules = [
    {
      id: 'buyer_show',
      customIcon: (
        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md shadow-blue-500/20 flex-shrink-0 group-hover:scale-105 transition-transform flex items-center justify-center p-0.5 bg-white border border-slate-100">
          <GrassWorkshopIcon className="w-full h-full" />
        </div>
      ),
      title: '种草工坊',
      subtitle: '爆款对标 · 4步全套闭环',
      action: onEnterBuyerShow,
      isReady: true
    },
    {
      id: 'collector_hub',
      customIcon: (
        <CollectorHubIcon className="w-10 h-10" />
      ),
      title: '全渠道智能采集',
      subtitle: '万邦电商 · 社媒无水印图集',
      action: onOpenCollectorHub || (() => {}),
      isReady: true
    },
    {
      id: 'model',
      customIcon: (
        <MannequinFittingIcon className="w-10 h-10" />
      ),
      title: 'AI 模特换装试穿',
      subtitle: '多姿态贴合 · 研发中',
      action: () => showToast('✨ AI 模特换装工坊即将升级发布，敬请期待！'),
      isReady: false
    },
    {
      id: 'upscale',
      customIcon: (
        <SuperResolution4KIcon className="w-10 h-10" />
      ),
      title: '4K 超清画质超分',
      subtitle: '微距光学细节增强 · 研发中',
      action: () => showToast('💎 4K 商业超分辨率增强模型即将上线！'),
      isReady: false
    }
  ];

  return (
    <div className="w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1400px] mx-auto relative">
      {/* 优雅悬浮 Toast */}
      {toastMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-bounce-in">
          <div className="px-4 py-2 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-slate-700 text-white text-xs font-bold shadow-2xl flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>{toastMsg}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5">
        {capsules.map((item) => (
          <div
            key={item.id}
            onClick={item.action}
            className={`p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-md transition-all flex items-center gap-3 cursor-pointer group select-none ${
              item.isReady 
                ? 'hover:border-indigo-400/90 hover:bg-slate-50/50' 
                : 'hover:border-slate-300 opacity-90'
            }`}
          >
            {item.customIcon}

            <div className="min-w-0 flex-1">
              <div className="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition-colors truncate flex items-center gap-1.5">
                <span>{item.title}</span>
                {item.isReady && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5 font-medium">
                {item.subtitle}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
