import type { ShotPrompt, PreviousGroupSignature } from '@/lib/vision';
import type { OriginalLookParts, OriginalProductRole } from '@/lib/drawing';
import type { ProductImage } from '@/types';
import type {
  AssistantMessage,
  AssistantSession,
  ChatSession,
  GenerationTask,
  MediaAttachment,
} from '@/types/app-store';

export type {
  ProductImage,
  ProductData,
} from '@/types';

export type {
  GenerationTask,
  ChatSession,
  MediaAttachment,
  ProductWidgetData,
  AssistantMessage,
  AssistantSession,
} from '@/types/app-store';

export interface ViewSlice {
  currentView: 'hub' | 'generate' | 'buyer_show' | 'assets';
  activeModuleId: string;
  setCurrentView: (view: 'hub' | 'generate' | 'buyer_show' | 'assets') => void;
  setActiveModuleId: (id: string) => void;
}

export interface HubSlice {
  hubGenMode: 'image' | 'video';
  quickPrompt: string;
  quickRefImage: string | null;
  quickRefImages: string[];
  quickModel: string;
  quickAspectId: string;
  quickQuality: 'high' | 'medium' | 'low';
  quickCount: number;
  quickVideoModel: string;
  quickVideoDuration: number;
  quickVideoResolution: '480P' | '720P' | '1080P' | '4K';
  quickVideoAspectId: string;
  quickVideoRefMode: string;
  quickVideoFirstFrame: string | null;
  quickVideoLastFrame: string | null;
  quickVideoMultiFrames: string[];
  quickVideoCount: number;
  setHubGenMode: (mode: 'image' | 'video') => void;
  setQuickPrompt: (prompt: string) => void;
  setQuickRefImage: (url: string | null) => void;
  setQuickRefImages: (urls: string[]) => void;
  addQuickRefImage: (url: string) => void;
  removeQuickRefImage: (index: number) => void;
  setQuickModel: (model: string) => void;
  setQuickAspectId: (aspectId: string) => void;
  setQuickQuality: (quality: 'high' | 'medium' | 'low') => void;
  setQuickCount: (count: number) => void;
  setQuickVideoModel: (model: string) => void;
  setQuickVideoDuration: (duration: number) => void;
  setQuickVideoResolution: (resolution: '480P' | '720P' | '1080P' | '4K') => void;
  setQuickVideoAspectId: (aspectId: string) => void;
  setQuickVideoRefMode: (mode: string) => void;
  setQuickVideoFirstFrame: (frame: string | null) => void;
  setQuickVideoLastFrame: (frame: string | null) => void;
  swapVideoFirstLastFrames: () => void;
  setQuickVideoMultiFrames: (frames: string[]) => void;
  addQuickVideoMultiFrame: (frame: string) => void;
  removeQuickVideoMultiFrame: (index: number) => void;
  setQuickVideoCount: (count: number) => void;
}

export interface GenerateSlice {
  sessions: ChatSession[];
  currentSessionId: string;
  previewTask: GenerationTask | null;
  previewQueue: GenerationTask[];
  hubGenerations: GenerationTask[];
  createSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, newTitle: string) => void;
  pinSession: (id: string) => void;
  renameTask: (taskId: string, newTitle: string) => void;
  setPreviewTask: (task: GenerationTask | null, queue?: GenerationTask[]) => void;
  setPreviewQueue: (queue: GenerationTask[]) => void;
  addHubGeneration: (task: GenerationTask, isNewSession?: boolean) => void;
  addBatchHubGenerations: (tasks: GenerationTask[], customTitle?: string, isNewSession?: boolean) => void;
  updateHubGeneration: (id: string, updates: Partial<GenerationTask>) => void;
  deleteHubGeneration: (id: string) => void;
  deleteGenerationPermanently: (ids: string[], urls?: string[]) => void;
  syncDatabaseTasks: (tasks: GenerationTask[]) => void;
}

export type WorkshopMode = 'storyboard_generate' | 'social_face_product_swap';

export interface WorkshopModeSession {
  currentStep: number;
  product: any | null;
  images: ProductImage[];
  apiUsed: string | null;
  clonedSocialImages: { url: string; selected: boolean }[];
  socialGalleryTab: 'social' | 'product';
  generatedPrompts: ShotPrompt[];
  shotCount: number;
  extraRequirements: string;
  selectedStyleId: string;
  productFingerprint: string;
  productRole: OriginalProductRole | null;
  masterScene: string;
  lookBible: string;
  identityBible: string;
  styleBible: string;
  lookParts: OriginalLookParts | null;
  previousMasterScenes: string[];
  previousGroupSignatures: PreviousGroupSignature[];
  sceneAnchorEnabled: boolean;
  socialPromptSourceKey: string;
  modelPersona: string;
  generationTasks: GenerationTask[];
  selectedAspectId: string;
  selectedQuality: 'high' | 'medium' | 'low';
  useReferenceImage: boolean;
  isBatchGenerating: boolean;
}

export interface WorkshopSlice {
  /** 爆款复刻模式独立会话缓存（切换模式时保存/恢复） */
  socialSessionCache: WorkshopModeSession;
  /** 原创生成模式独立会话缓存 */
  originalSessionCache: WorkshopModeSession;
  currentStep: number;
  product: any | null;
  images: ProductImage[];
  apiUsed: string | null;
  isLoading: boolean;
  error: string | null;
  selectedVisionModel: string;
  selectedStyleId: string;
  shotCount: number;
  extraRequirements: string;
  isAnalyzing: boolean;
  productFingerprint: string;
  /** 原创：商品在画面中的角色 */
  productRole: OriginalProductRole | null;
  generatedPrompts: ShotPrompt[];
  masterScene: string;
  lookBible: string;
  identityBible: string;
  styleBible: string;
  lookParts: OriginalLookParts | null;
  previousMasterScenes: string[];
  previousGroupSignatures: PreviousGroupSignature[];
  sceneAnchorEnabled: boolean;
  selectedImageGenModel: string;
  selectedAspectId: string;
  selectedQuality: 'high' | 'medium' | 'low';
  useReferenceImage: boolean;
  isBatchGenerating: boolean;
  generationTasks: GenerationTask[];
  workshopMode: WorkshopMode;
  socialGalleryTab: 'social' | 'product';
  clonedSocialImages: { url: string; selected: boolean }[];
  modelPersona: string;
  /** 爆款复刻专属正脸 */
  anchorFaceImageUrl?: string;
  isAnchorFaceConfirmed: boolean;
  /** 原创生成专属正脸（与爆款槽位隔离，避免遗留人脸泄漏） */
  originalAnchorFaceImageUrl?: string;
  originalIsAnchorFaceConfirmed: boolean;
  socialPromptSourceKey: string;
  getEffectiveAnchorFaceImageUrl: () => string | undefined;
  getEffectiveIsAnchorFaceConfirmed: () => boolean;
  setWorkshopMode: (mode: WorkshopMode) => void;
  resetModeSession: (mode?: WorkshopMode) => void;
  setSocialGalleryTab: (tab: 'social' | 'product') => void;
  setTargetProductImage: (url: string) => void;
  setClonedSocialImages: (images: string[]) => void;
  toggleClonedSocialImage: (index: number) => void;
  selectAllClonedImages: (select: boolean) => void;
  setModelPersona: (persona: string) => void;
  setAnchorFaceImageUrl: (url?: string) => void;
  setIsAnchorFaceConfirmed: (confirmed: boolean) => void;
  isSocialPromptSourceStale: () => boolean;
  getSelectedSocialPromptKey: () => string;
  setStep: (step: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProductData: (product: any, images: { main: string[]; details: string[]; skus: string[] }, apiUsed?: string) => void;
  toggleImageSelection: (index: number) => void;
  selectAllImages: (type?: 'main' | 'detail' | 'sku') => void;
  clearSelection: () => void;
  deselectAllImages: () => void;
  setSelectedVisionModel: (model: string) => void;
  setSelectedStyleId: (styleId: string) => void;
  setShotCount: (count: number) => void;
  setExtraRequirements: (text: string) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setGeneratedPrompts: (
    prompts: ShotPrompt[],
    fingerprint?: string,
    meta?: {
      masterScene?: string;
      lookBible?: string;
      identityBible?: string;
      styleBible?: string;
      lookParts?: OriginalLookParts | null;
      productRole?: OriginalProductRole | null;
      actionDigest?: string;
    }
  ) => void;
  setMasterScene: (scene: string) => void;
  setLookBible: (look: string) => void;
  setIdentityBible: (identity: string) => void;
  setStyleBible: (style: string) => void;
  setLookParts: (parts: OriginalLookParts | null) => void;
  setProductRole: (role: OriginalProductRole | null) => void;
  setSceneAnchorEnabled: (enabled: boolean) => void;
  applyGroupLocksToPrompts: () => void;
  updateShotPrompt: (index: number, newPrompt: Partial<ShotPrompt>) => void;
  toggleShotSelection: (index: number) => void;
  addShotPrompt: (prompt?: Partial<ShotPrompt>) => void;
  deleteShotPrompt: (index: number) => void;
  setSelectedImageGenModel: (model: string) => void;
  setSelectedAspectId: (aspectId: string) => void;
  setSelectedQuality: (quality: 'high' | 'medium' | 'low') => void;
  setUseReferenceImage: (useRef: boolean) => void;
  setIsBatchGenerating: (isGenerating: boolean) => void;
  initGenerationTasks: (forceReset?: boolean) => void;
  updateGenerationTask: (id: string, updates: Partial<GenerationTask>) => void;
  setAllTasksStatus: (status: 'IDLE' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE') => void;
}

export interface AssistantSlice {
  isAssistantOpen: boolean;
  assistantSessions: AssistantSession[];
  currentAssistantSessionId: string;
  assistantModel: string;
  assistantHistoryLimit: number;
  assistantAttachments: MediaAttachment[];
  assistantInputDraft: string;
  setIsAssistantOpen: (open: boolean) => void;
  setAssistantModel: (model: string) => void;
  setAssistantHistoryLimit: (limit: number) => void;
  setAssistantInputDraft: (draft: string) => void;
  createAssistantSession: () => void;
  switchAssistantSession: (id: string) => void;
  deleteAssistantSession: (id: string) => Promise<{ success: boolean; error?: string }>;
  renameAssistantSession: (id: string, title: string) => void;
  addAssistantMessage: (sessionId: string, message: AssistantMessage) => void;
  updateAssistantMessage: (sessionId: string, messageId: string, updates: Partial<AssistantMessage>) => void;
  persistAssistantNow: () => void;
  hydrateAssistantSessions: () => Promise<void>;
  setAssistantAttachments: (attachments: MediaAttachment[]) => void;
  addAssistantAttachment: (att: MediaAttachment) => void;
  removeAssistantAttachment: (index: number) => void;
  clearAssistantAttachments: () => void;
}

export type AppState = ViewSlice & HubSlice & GenerateSlice & WorkshopSlice & AssistantSlice;
