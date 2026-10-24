import { createContext, useContext, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { BatchProductItem } from '../../model/batchTypes';

export interface BatchConfigContextValue {
  successfulItems: BatchProductItem[];
  setItems: Dispatch<SetStateAction<BatchProductItem[]>>;
  activeImgFilter: 'all' | 'main' | 'sku' | 'detail';
  setActiveImgFilter: (filter: 'all' | 'main' | 'sku' | 'detail') => void;
  toggleProductImageSelection: (itemId: string, imageUrl: string) => void;
  batchSetProductImages: (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => void;
  handleRemoveItem: (id: string) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  onPreviewImage?: (url: string) => void;
  onNextStage: () => void;
  onPrevStage: () => void;
  analysisIssue: string | null;
  busy: boolean;
}

const BatchConfigContext = createContext<BatchConfigContextValue | null>(null);

export function BatchConfigProvider({
  value,
  children,
}: {
  value: BatchConfigContextValue;
  children: ReactNode;
}) {
  return <BatchConfigContext.Provider value={value}>{children}</BatchConfigContext.Provider>;
}

export function useBatchConfig(): BatchConfigContextValue {
  const ctx = useContext(BatchConfigContext);
  if (!ctx) {
    throw new Error('useBatchConfig must be used within BatchConfigProvider');
  }
  return ctx;
}
