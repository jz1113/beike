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
    const { productTitle, productFingerprint, prompts, referenceImages = [] } = pendingBatchPromptImport;
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
        // Imported references remain available for review, but never count as a
        // new production selection until the user explicitly picks them.
        allTypedImages: referenceImages.map((url) => ({ url, type: 'main' as const })),
        selectedProductImages: [],
        analyzedSuccess: false,
        productFingerprint: productFingerprint || '',
        prompts,
        tasks: [],
      };
      return [...prev, importItem];
    });

    setCurrentStage(2);
    setPendingBatchPromptImport(null);
    showToast(`已导入 ${prompts.length} 条历史分镜；请确认当前商品图，再按创作技能重新分析。历史分镜保留供核对。`);
  }, [workspaceReady, setCurrentStage, pendingBatchPromptImport, setPendingBatchPromptImport, showToast, setItems]);

}
