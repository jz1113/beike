import type { GenerationStrategy } from '../../model/batchTypes';
import type { PromptAssetType } from '@shared/domain/prompts/prompt-asset/states';

export interface WorkshopSettingsModalProps {
  isOpen: boolean;
  workspaceStatus?: string;
  workspaceError?: string | null;
  busy?: boolean;
  skillLoadState?: 'loading' | 'ready' | 'error';
  skillLoadError?: string;
  onReloadSkills?: () => void;
  onOpenAssets?: (type?: PromptAssetType) => void;
  onClose: () => void;
  selectedArchId: string;
  setSelectedArchId: (id: string) => void;
  recipes: Array<{ id: string; name: string; category?: string; promptSnippet?: string }>;
  selectedShotCount: number;
  setSelectedShotCount: (cnt: number) => void;
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  setSelectedAspect: (asp: '3:4' | '1:1' | '9:16' | '16:9') => void;
  gridOutputSize?: string;
  setGridOutputSize: (size: string | undefined) => void;
  selectedQuality: 'high' | 'medium' | 'low';
  setSelectedQuality: (q: 'high' | 'medium' | 'low') => void;
  selectedVisionModel: string;
  setSelectedVisionModel: (m: string) => void;
  availableVisionModels: Array<{ id: string; name?: string; shortName?: string; provider?: string; upstreamId?: string }>;
  selectedImageGenModel: string;
  setSelectedImageGenModel: (m: string) => void;
  availableImageModels: Array<{ id: string; name?: string; shortName?: string; provider?: string; upstreamId?: string }>;
  generationStrategy: GenerationStrategy;
  setGenerationStrategy: (strategy: GenerationStrategy) => void;
  autoGenerateCopywriting: boolean;
  setAutoGenerateCopywriting: (enabled: boolean) => void;
  imageGenConcurrency: number;
  setImageGenConcurrency?: (n: number) => void;
  analyzeConcurrency: number;
  setAnalyzeConcurrency?: (n: number) => void;
}
