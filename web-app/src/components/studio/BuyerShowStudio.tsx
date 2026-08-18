'use client';
import { useAppStore } from '@/store/useAppStore';
import StudioSidebar from './StudioSidebar';
import StudioGallery from './StudioGallery';
import PromptStudio from './PromptStudio';
import ImageGenStudio from './ImageGenStudio';
import ExportStudio from './ExportStudio';

interface Props {
  onOpenHistory: () => void;
  onOpenPromptHistory: () => void;
  onOpenSettings: () => void;
}

export default function BuyerShowStudio({ 
  onOpenHistory, 
  onOpenPromptHistory, 
  onOpenSettings 
}: Props) {
  const { currentStep, setStep } = useAppStore();

  return (
    <div className="flex-1 flex overflow-hidden relative bg-[#F8F9FC]">
      {currentStep === 1 ? (
        /* Step 1: 左右分栏专业素材采编工坊 */
        <>
          <StudioSidebar 
            onOpenHistory={onOpenHistory}
            onNextStep={() => setStep(2)}
          />
          <StudioGallery 
            onNextStep={() => setStep(2)}
          />
        </>
      ) : currentStep === 2 ? (
        /* Step 2: 视觉模型分析与提示词工作台 */
        <PromptStudio 
          onBackToStep1={() => setStep(1)}
          onNextToStep3={() => setStep(3)}
          onOpenPromptHistory={onOpenPromptHistory}
          onOpenSettings={onOpenSettings}
        />
      ) : currentStep === 3 ? (
        /* Step 3: AI 种草买家秀生图画布 (异步渲染) */
        <ImageGenStudio 
          onBackToStep2={() => setStep(2)}
          onNextToStep4={() => setStep(4)}
        />
      ) : currentStep === 4 ? (
        /* Step 4: 成果打包交付与批量导出 (按商品skuid归档) */
        <ExportStudio 
          onBackToStep3={() => setStep(3)}
          onResetToStep1={() => setStep(1)}
        />
      ) : null}
    </div>
  );
}

