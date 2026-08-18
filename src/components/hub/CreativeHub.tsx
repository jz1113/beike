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
  const { setQuickPrompt, setQuickRefImage } = useAppStore();

  const handleUsePrompt = (prompt: string, refImage?: string) => {
    setQuickPrompt(prompt);
    if (refImage) {
      setQuickRefImage(refImage);
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-[#F8F9FC] text-slate-900 select-none pb-16">
      <div className="w-full px-4 sm:px-6 lg:px-8 2xl:px-10 py-5 sm:py-6 space-y-6">
        {/* 🌟 1. 顶部核心：对话生图控制大卡片 */}
        <div className="max-w-6xl xl:max-w-7xl 2xl:max-w-[1400px] mx-auto w-full space-y-4">
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
