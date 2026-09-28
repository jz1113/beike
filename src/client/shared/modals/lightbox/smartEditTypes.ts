export interface MarkerPoint {
  id: string;
  x: number; // 百分比 0 ~ 100
  y: number; // 百分比 0 ~ 100
  index: number;
  type?: 'point' | 'box';
  width?: number; // 百分比 0 ~ 100 (框选)
  height?: number; // 百分比 0 ~ 100 (框选)
}

export interface DragBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SmartEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  originalPrompt?: string;
  onSubmitSmartEdit: (params: {
    markers: MarkerPoint[];
    prompt: string;
    model: string;
    quality: string;
    aspectRatio?: string;
  }) => void;
  quickModel?: string;
  quickQuality?: string;
  quickAspectId?: string;
  onChangeQuickModel?: (id: string) => void;
  onChangeQuickQuality?: (quality: 'low' | 'medium' | 'high') => void;
  onChangeQuickAspectId?: (id: string) => void;
}
