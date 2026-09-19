import { createContext, useContext, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { BatchProductItem, GenerationStrategy } from '../batchTypes';

interface RecipeOption {
  id: string;
  name: string;
  category?: string;
  tag?: string;
  promptSnippet?: string;
}

interface ModelOption {
  id: string;
  name: string;
  shortName?: string;
}

interface AssetOption {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  code?: string;
  lighting?: string;
  top?: string;
  bottom?: string;
}

export interface BatchConfigContextValue {
  batchMode: 'original' | 'replication';
  currentStage: number;
  successfulItems: BatchProductItem[];
  setItems: Dispatch<SetStateAction<BatchProductItem[]>>;
  recipes: RecipeOption[];
  selectedArchId: string;
  setSelectedArchId: (id: string) => void;
  availableVisionModels: ModelOption[];
  selectedVisionModel: string;
  setSelectedVisionModel: (id: string) => void;
  availableImageModels: ModelOption[];
  selectedImageGenModel: string;
  setSelectedImageGenModel: (id: string) => void;
  hasHumanPersona: boolean;
  setHasHumanPersona: (v: boolean) => void;
  useAssetLibrary: boolean;
  setUseAssetLibrary: (v: boolean) => void;
  lockedPersonaId: string;
  setLockedPersonaId: (id: string) => void;
  lockedSceneId: string;
  setLockedSceneId: (id: string) => void;
  lockedOutfitId: string;
  setLockedOutfitId: (id: string) => void;
  availablePersonas: AssetOption[];
  availableScenes: AssetOption[];
  availableOutfits: AssetOption[];
  generationStrategy: GenerationStrategy;
  setGenerationStrategy: (s: GenerationStrategy) => void;
  imageGenConcurrency: number;
  setImageGenConcurrency: (n: number) => void;
  selectedQuality: 'high' | 'medium' | 'low';
  setSelectedQuality: (q: 'high' | 'medium' | 'low') => void;
  selectedAspect: '3:4' | '1:1' | '9:16' | '16:9';
  setSelectedAspect: (a: '3:4' | '1:1' | '9:16' | '16:9') => void;
  selectedShotCount: number;
  setSelectedShotCount: (n: number) => void;
  analyzeConcurrency: number;
  setAnalyzeConcurrency: (n: number) => void;
  isAnalyzingAll: boolean;
  analyzeProgress: { current: number; total: number };
  startBatchAnalyze: () => Promise<number | void>;
  replicationInputMode: 'one_to_one' | 'matrix';
  setReplicationInputMode: (m: 'one_to_one' | 'matrix') => void;
  matrixMasterRefUrl: string;
  setMatrixMasterRefUrl: (url: string) => void;
  matrixMasterRefImages: string[];
  setMatrixMasterRefImages: (urls: string[]) => void;
  isMatrixParsing: boolean;
  handleParseMatrixMasterRef: () => Promise<void>;
  isBatchRefParsing: boolean;
  handleBatchParse1to1Refs: () => Promise<void>;
  activeImgFilter: 'all' | 'main' | 'sku' | 'detail';
  setActiveImgFilter: (f: 'all' | 'main' | 'sku' | 'detail') => void;
  toggleProductImageSelection: (itemId: string, imgUrl: string) => void;
  batchSetProductImages: (itemId: string, mode: 'all_main' | 'all' | 'first' | 'clear') => void;
  toggleReferenceImageSelection: (itemId: string, imgUrl: string) => void;
  handleRemoveItem: (id: string) => void;
  onPreviewGallery?: (images: string[], index?: number, title?: string) => void;
  onPreviewImage?: (url: string) => void;
  onStartAutoPilot?: () => Promise<void>;
  isAutoPilotRunning?: boolean;
  onNextStage: () => void;
  onPrevStage: () => void;
  openWorkshopConfig?: () => void;
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
