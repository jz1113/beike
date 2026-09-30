import type { BatchProductItem } from '../model/batchTypes';
import {
  type CopywritingContext,
  generateCopywritingForProduct as generateCopywritingForProductUtil,
  updateItemCopywriting as updateItemCopywritingUtil,
  generateAllCopywriting as generateAllCopywritingUtil,
} from '../model/delivery/batchCopywriting';

export function useBatchCopywriting({ getItems, setItems, selectedVisionModel, showToast, analyzeConcurrency }: CopywritingContext) {
  // 文案生成
  const generateCopywritingForProduct = async (item: BatchProductItem) => {
    await generateCopywritingForProductUtil(item, {
      getItems,
      setItems,
      selectedVisionModel,
      showToast,
      analyzeConcurrency,
    });
  };

  const updateItemCopywriting = (
    itemId: string,
    copywriting: { title: string; content: string; tags?: string[] }
  ) => {
    updateItemCopywritingUtil(setItems, itemId, copywriting);
  };

  const generateAllCopywriting = async (options?: { force?: boolean }) => {
    await generateAllCopywritingUtil({
      getItems,
      setItems,
      selectedVisionModel,
      showToast,
      analyzeConcurrency,
      force: options?.force,
    });
  };

  return { generateCopywritingForProduct, updateItemCopywriting, generateAllCopywriting };
}
