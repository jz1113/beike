import type { SalesAssetCreation } from './salesAssetCreation';

export const PERSONA_ANGLES = [
  { id: 'front', label: '正面全身', hint: '从头顶到鞋底的正面照' },
  { id: 'side', label: '侧面全身', hint: '左侧 90 度全身照' },
  { id: 'back', label: '背面全身', hint: '背对镜头的全身照' },
  { id: 'face', label: '脸部特写', hint: '正面头肩近景' },
] as const;

export function hasLegacyPersonaSheet(views: Record<string, string>) {
  return PERSONA_ANGLES.every(({ id }) => Boolean(views[id]));
}

export interface AssetViewDefinition<V extends string> {
  id: V | 'main';
  label: string;
  hint: string;
}

export interface AssetViewSet<V extends string> {
  views: Record<V | 'main', string>;
  extraImages: string[];
}

export interface AssetViewRequest {
  key: string;
  jobId?: string;
  assetId?: string;
  taskId?: string;
  resultUrl?: string;
  images?: Record<string, string>;
  model: string;
  references: string[];
  prompt?: string;
  promptVersion?: string;
  layout?: '1x4' | '3x3';
  creation?: SalesAssetCreation;
  analysisModel?: string;
}
