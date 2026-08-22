'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useFileDropZone } from '@/lib/useFileDropZone';
import { isImageFile } from '@/lib/mediaUpload';
import { compressImageFilesToDataUrls } from '@/lib/workshopFileDrop';
import StudioSidebar from './StudioSidebar';
import StudioGallery from './StudioGallery';
import PromptStudio from './PromptStudio';
import ImageGenStudio from './ImageGenStudio';
import ExportStudio from './ExportStudio';
import WorkshopTopBar, { WorkshopPrimaryAction, WorkshopStepId } from './WorkshopTopBar';

interface Props {
  onOpenHistory: () => void;
  onOpenPromptHistory: () => void;
  onOpenSettings: () => void;
}

export default function BuyerShowStudio({
  onOpenHistory,
  onOpenPromptHistory,
  onOpenSettings,
}: Props) {
  const {
    currentStep,
    setStep,
    product,
    images,
    generatedPrompts,
    generationTasks,
    workshopMode,
    clonedSocialImages,
    initGenerationTasks,
    setClonedSocialImages,
    setProductData,
    resetModeSession,
  } = useAppStore();

  const [step3Action, setStep3Action] = useState<WorkshopPrimaryAction | null>(null);
  const [step4Action, setStep4Action] = useState<WorkshopPrimaryAction | null>(null);
  const [workshopToast, setWorkshopToast] = useState<string | null>(null);

  const showWorkshopToast = useCallback((msg: string) => {
    setWorkshopToast(msg);
    setTimeout(() => setWorkshopToast(null), 2500);
  }, []);

  const rejectWorkshopDrop = useCallback(() => {
    showWorkshopToast('无法识别拖入的文件，请使用 JPG/PNG/WebP 等图片');
  }, [showWorkshopToast]);

  const routeWorkshopFiles = useCallback(
    async (files: File[]) => {
      if (workshopMode === 'social_face_product_swap') {
        const urls = await compressImageFilesToDataUrls(files);
        if (urls.length > 0) {
          setClonedSocialImages(urls);
          showWorkshopToast(`已载入 ${urls.length} 张参考图`);
        } else {
          rejectWorkshopDrop();
        }
        return;
      }

      const urls = await compressImageFilesToDataUrls(files);
      if (urls.length === 0) {
        rejectWorkshopDrop();
        return;
      }

      if (product) {
        const existing = useAppStore.getState().images;
        const newImgs = urls.map((url) => ({ url, type: 'detail' as const, selected: true }));
        useAppStore.setState({ images: [...existing, ...newImgs] });
        showWorkshopToast(`已补充 ${urls.length} 张商品图`);
        return;
      }

      const baseName = files[0]?.name.replace(/\.[^/.]+$/, '') || '本地导入素材';
      const localProduct = {
        id: 'local_temp_' + Date.now(),
        platform: 'local',
        itemId: `LOCAL_${Date.now()}`,
        title: baseName,
        picUrl: urls[0] || '',
        createdAt: new Date().toISOString(),
      };
      setProductData(localProduct, { main: urls, details: [], skus: [] }, '📁 拖入导入 (未入库)');
      showWorkshopToast(`已导入 ${urls.length} 张商品图`);
    },
    [workshopMode, product, setClonedSocialImages, setProductData, showWorkshopToast, rejectWorkshopDrop],
  );

  const { dropZoneProps: workshopDropProps } = useFileDropZone({
    onFiles: (files) => {
      void routeWorkshopFiles(files);
    },
    accept: isImageFile,
    onReject: rejectWorkshopDrop,
  });

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasDraft =
        Boolean(product) ||
        (images && images.length > 0) ||
        (generatedPrompts && generatedPrompts.length > 0) ||
        (generationTasks && generationTasks.some((t) => t.status === 'IN_PROGRESS' || t.status === 'SUCCESS'));
      if (!hasDraft) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [product, images, generatedPrompts, generationTasks]);

  const selectedSocialCount = clonedSocialImages.filter((i) => i.selected).length;
  const selectedImageCount = images.filter((img) => img.selected).length;
  const selectedPromptCount = generatedPrompts.filter((p) => p.selected !== false).length;
  const successCount = generationTasks.filter((t) => t.status === 'SUCCESS' && t.resultUrl).length;

  const canEnterStep2 =
    workshopMode === 'social_face_product_swap'
      ? selectedSocialCount > 0 && Boolean(product) && selectedImageCount > 0
      : Boolean(product) && selectedImageCount > 0;
  const canEnterStep3 = selectedPromptCount > 0 && generatedPrompts.length > 0;
  const canEnterStep4 = successCount > 0;

  const maxReachableStep = useMemo((): WorkshopStepId => {
    if (canEnterStep4 || currentStep >= 4) return 4;
    if (canEnterStep3 || currentStep >= 3) return 3;
    if (canEnterStep2 || currentStep >= 2) return 2;
    return 1;
  }, [canEnterStep2, canEnterStep3, canEnterStep4, currentStep]);

  const goStep2 = useCallback(() => {
    if (workshopMode === 'social_face_product_swap' && selectedSocialCount > 0) {
      useAppStore.setState({ shotCount: selectedSocialCount });
    }
    setStep(2);
  }, [workshopMode, selectedSocialCount, setStep]);

  const goStep3 = useCallback(() => {
    initGenerationTasks(false);
    setStep(3);
  }, [initGenerationTasks, setStep]);

  const goBackToStep1 = useCallback(() => setStep(1), [setStep]);
  const handleResetSession = useCallback(() => resetModeSession(), [resetModeSession]);
  const goBackToStep2 = useCallback(() => setStep(2), [setStep]);
  const goStep4 = useCallback(() => setStep(4), [setStep]);
  const goBackToStep3 = useCallback(() => setStep(3), [setStep]);

  const primaryAction = useMemo((): WorkshopPrimaryAction | null => {
    const step = currentStep as WorkshopStepId;
    if (step === 1) {
      return {
        label:
          workshopMode === 'social_face_product_swap'
            ? `下一步：提示词 (${selectedSocialCount})`
            : `下一步：提示词 (${selectedImageCount})`,
        disabled: !canEnterStep2,
        onClick: goStep2,
      };
    }
    if (step === 2) {
      return {
        label: `下一步：生图 (${selectedPromptCount})`,
        disabled: !canEnterStep3,
        onClick: goStep3,
      };
    }
    if (step === 3) {
      // 原创：由 ImageGenStudio 绑定阶段主 CTA；爆款：优先导出，否则由子组件覆盖批量
      return (
        step3Action || {
          label: `下一步：导出 (${successCount})`,
          disabled: !canEnterStep4,
          onClick: goStep4,
        }
      );
    }
    if (step === 4) {
      return step4Action;
    }
    return null;
  }, [
    currentStep,
    workshopMode,
    selectedSocialCount,
    selectedImageCount,
    selectedPromptCount,
    successCount,
    canEnterStep2,
    canEnterStep3,
    canEnterStep4,
    goStep2,
    goStep3,
    goStep4,
    setStep,
    step3Action,
    step4Action,
  ]);

  const handleStepChange = (step: WorkshopStepId) => {
    if (step > maxReachableStep) return;
    setStep(step);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden relative bg-[#F8F9FA]">
      <WorkshopTopBar
        currentStep={(currentStep as WorkshopStepId) || 1}
        maxReachableStep={maxReachableStep}
        onStepChange={handleStepChange}
        primaryAction={primaryAction}
      />

      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0 relative">
        {workshopToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-2xl bg-slate-900 text-white text-xs font-semibold shadow-xl pointer-events-none">
            {workshopToast}
          </div>
        )}
        {currentStep === 1 ? (
          <div
            {...workshopDropProps}
            className="flex-1 flex overflow-hidden min-h-0 min-w-0 relative"
          >
            <StudioSidebar
              onOpenHistory={onOpenHistory}
              onNextStep={goStep2}
              hideFooterCta
            />
            <StudioGallery onNextStep={goStep2} hideFloatingCta />
          </div>
        ) : currentStep === 2 ? (
          <PromptStudio
            onBackToStep1={goBackToStep1}
            onNextToStep3={goStep3}
            onOpenPromptHistory={onOpenPromptHistory}
            onOpenSettings={onOpenSettings}
            hideChromeNav
          />
        ) : currentStep === 3 ? (
          <ImageGenStudio
            onBackToStep2={goBackToStep2}
            onNextToStep4={goStep4}
            hideChromeNav
            onBindPrimaryAction={setStep3Action}
          />
        ) : currentStep === 4 ? (
          <ExportStudio
            onBackToStep3={goBackToStep3}
            onResetToStep1={handleResetSession}
            hideChromeNav
            onBindPrimaryAction={setStep4Action}
          />
        ) : null}
      </div>
    </div>
  );
}
