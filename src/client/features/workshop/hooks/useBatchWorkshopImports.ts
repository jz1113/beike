import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { useAppStore } from '@client/store';
import type { BatchProductItem } from '../model/batchTypes';

interface BatchWorkshopImports {
  workspaceReady: boolean;
  setCurrentStage: Dispatch<SetStateAction<number>>;
  setItems: Dispatch<SetStateAction<BatchProductItem[]>>;
  showToast: (message: string) => void;
}

export function useBatchWorkshopImports({ workspaceReady, setCurrentStage, setItems, showToast }: BatchWorkshopImports) {
  // 全局 Store 订阅与联动
  const pendingBatchStage = useAppStore((s) => s.pendingBatchStage);
  const setPendingBatchStage = useAppStore((s) => s.setPendingBatchStage);
  const pendingBatchPromptImport = useAppStore((s) => s.pendingBatchPromptImport);
  const setPendingBatchPromptImport = useAppStore((s) => s.setPendingBatchPromptImport);

  useEffect(() => {
    if (!workspaceReady || pendingBatchStage == null) return;
    const stage = Math.max(1, Math.min(4, pendingBatchStage));
    setCurrentStage(stage);
    setPendingBatchStage(null);
  }, [workspaceReady, pendingBatchStage, setPendingBatchStage, setCurrentStage]);

  useEffect(() => {
    if (!workspaceReady || !pendingBatchPromptImport?.prompts?.length) return;
    const { productTitle, productFingerprint, prompts, referenceImages = [], masterImageIndex } = pendingBatchPromptImport;
    const importId = `hist_${Date.now()}`;

    setItems((prev) => {
      if (
        productFingerprint &&
        prev.some((p) => p.productFingerprint === productFingerprint && p.analyzedSuccess)
      ) {
        return prev;
      }
      const importItem: BatchProductItem = {
        id: importId,
        itemId: importId,
        platform: 'jd',
        title: productTitle || '历史分镜商品',
        price: 0,
        category: '历史导入',
        brand: '',
        coverImage: referenceImages[0] || '',
        mainImages: referenceImages,
        skuImages: [],
        detailImages: [],
        props: {},
        status: 'success',
        selected: true,
        allTypedImages: [],
        selectedProductImages: referenceImages,
        analyzedSuccess: true,
        productFingerprint: productFingerprint || '',
        prompts,
        tasks: [],
      };
      return [...prev, importItem];
    });

    setCurrentStage(3);
    setPendingBatchPromptImport(null);
    showToast(`已载入 ${prompts.length} 条图组分镜${masterImageIndex ? `（母本图 #${masterImageIndex}）` : ''}；场景、镜头动作与同组参考图已联动，可直接确认后生图。`);
  }, [workspaceReady, setCurrentStage, pendingBatchPromptImport, setPendingBatchPromptImport, showToast, setItems]);

}
