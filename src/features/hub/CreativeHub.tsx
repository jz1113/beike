'use client';
import { useAppStore } from '@/store/useAppStore';
import PromptActionBar from './PromptActionBar';
import FeatureCapsules from './FeatureCapsules';
import InspirationFeed from './InspirationFeed';

interface Props {
  onEnterBuyerShow: () => void;
  onOpenHistory: () => void;
  onOpenPromptVault: () => void;
  onOpenSettings: () => void;
  onOpenCollectorHub?: () => void;
}

export default function CreativeHub({ 
  onEnterBuyerShow, 
  onOpenHistory, 
  onOpenPromptVault, 
  onOpenSettings,
  onOpenCollectorHub
}: Props) {
  const { setQuickPrompt, setQuickRefImage, setHubGenMode, setQuickVideoRefMode } = useAppStore();

  const handleUsePrompt = (prompt: string, refMedia?: string) => {
    const isVideo = !!(refMedia && (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(refMedia) || refMedia.startsWith('data:video/')));
    setQuickPrompt(prompt);
    if (isVideo && refMedia) {
      // 视频灵感：携带参考视频 + 切到全能参考
      setHubGenMode('video');
      setQuickVideoRefMode('omni');
      setQuickRefImage(refMedia);
    } else if (refMedia) {
      // 显式「用作参考图」才带图
      setHubGenMode('image');
      setQuickRefImage(refMedia);
    } else {
      // 文生图「做同款」：只填提示词，清掉参考素材，避免误成图生图
      setHubGenMode('image');
      setQuickRefImage(null);
    }
  };

  return (
    <div data-hub-scroll className="flex-1 w-full overflow-y-auto bg-[#F8F9FC] text-slate-900 select-none pb-16">
      <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-10 py-5 sm:py-6 space-y-6">
        {/* 🌟 1. 顶部核心：对话生图控制大卡片 */}
        <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-[1460px] mx-auto w-full space-y-4">
          <PromptActionBar onOpenProductVault={onOpenHistory} />
          <FeatureCapsules 
            onEnterBuyerShow={onEnterBuyerShow} 
            onOpenCollectorHub={onOpenCollectorHub}
          />
        </div>

        {/* 🌟 2. 下方：即梦风格紧凑无缝灵感瀑布流 */}
        <div className="w-full">
          <InspirationFeed
            onUsePrompt={handleUsePrompt}
            onOpenProductVault={onOpenHistory}
          />
        </div>
      </div>
    </div>
  );
}
