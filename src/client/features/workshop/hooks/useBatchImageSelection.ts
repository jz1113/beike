import type { Dispatch, SetStateAction } from 'react';
import type { BatchProductItem } from '../model/batchTypes';
import { applyInvalidationToItems } from '../model/workspace/applyInvalidation';
import {
  toggleProductImageSelection as toggleProductImageSelectionPure,
  batchSetProductImages as batchSetProductImagesPure,
} from '../model/collection/batchImageSelection';

export function useBatchImageSelection(setItems: Dispatch<SetStateAction<BatchProductItem[]>>) {
  // 选图纯函数绑定
  const toggleProductImageSelection = (itemId: string, imgUrl: string) => {
    setItems((prev) => applyInvalidationToItems(
      toggleProductImageSelectionPure(prev, itemId, imgUrl),
      { type: 'product_images', productId: itemId },
    ));
  };

  const batchSetProductImages = (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => {
    setItems((prev) => applyInvalidationToItems(
      batchSetProductImagesPure(prev, itemId, mode),
      { type: 'product_images', productId: itemId },
    ));
  };

  return { toggleProductImageSelection, batchSetProductImages };
}
