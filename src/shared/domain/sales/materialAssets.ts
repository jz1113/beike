import type { SalesBgmCandidate, SalesPersonaCandidate, SalesSceneCandidate, SalesVoiceCandidate } from './assetRecommendation';

export interface SalesActionCandidate {
  mediaType?: 'image' | 'video' | 'depth-image' | 'depth-video';
  mediaUrl?: string;
  sourceUrl?: string;
  sourceImages?: string[];
  dimensions?: string;
  productCategoryIds?: string[];
  categoryId?: string;
  id: string;
  title: string;
  action: string;
  shotType: string;
  camera: string;
  tags: string;
  coverUrl: string;
}

export interface SalesMaterialCatalog {
  personas: SalesPersonaCandidate[];
  scenes: SalesSceneCandidate[];
  actions: SalesActionCandidate[];
  voices: SalesVoiceCandidate[];
  bgms: SalesBgmCandidate[];
}
