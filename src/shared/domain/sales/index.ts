export * from './scriptTemplate';

export interface SalesPersonaCandidate {
  id: string;
  name: string;
  description: string;
  tags: string;
  dimensions?: string;
  identityUrl?: string;
  avatarUrl: string;
  fullBodyUrl: string;
  faceUrl: string;
  sourceImages: string[];
  hasReferenceImage: boolean;
  source: string;
  defaultVoiceId?: string;
}

export interface SalesSceneCandidate {
  id: string;
  title: string;
  description: string;
  lighting: string;
  category: string;
  spatialType: string;
  tags: string;
  suitableCategories: string[];
  coverUrl: string;
  sourceImages: string[];
  dimensions?: string;
  source: string;
}

export interface SalesVoiceCandidate {
  id: string;
  name: string;
  voiceId: string;
  ttsVoice: string;
  gender: string;
  voiceGroup?: string;
  tags: string[];
  sampleAudioUrl: string;
  promptText: string;
  source: string;
}

export interface SalesBgmCandidate {
  id: string;
  title: string;
  description: string;
  moodTags: string[];
  bpm: number;
  durationSec: number;
  suitableCategories: string[];
  license: string;
  audioUrl: string;
  source?: string;
  editable?: boolean;
}

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
