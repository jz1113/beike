import type { MouseEvent } from 'react';
import type { AssetSubTab } from '../../model/assetPromptConstants';

export interface AssetDetailModalProps {
  detailItem: any | null;
  activeSubTab: AssetSubTab;
  detailLoading: boolean;
  detailActiveImageIndex: number;
  copiedId: string | null;
  onClose: () => void;
  onSelectImageIndex: (index: number) => void;
  onZoomImage: (url: string) => void;
  onCopyPrompt: (text: string, id: string, e: MouseEvent) => void;
  onOpenTagEdit: (item: any) => void;
  onDeleteAsset: (id: string, e: MouseEvent) => void;
  onApplyToWorkshop: (item: any) => void;
  getAssetPreviewText: (item: any) => string;
}

