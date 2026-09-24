import type { ShotPrompt, PreviousGroupSignature } from '@beike/domain/vision';
import type { OriginalLookParts, OriginalProductRole } from '@beike/domain/drawing';
import type { ProductImage, ProductData } from '@/types/product';
import type { ProductWidgetData } from '@/store/appStoreTypes';
import type {
  AssistantMessage,
  AssistantSession,
  ChatSession,
  GenerationTask,
  MediaAttachment,
} from '@/store/appStoreTypes';
import type { AppView } from '@/store/appView';
import type { DepthQuality, DepthVideoStyle, QuickGenMode } from '@beike/domain/depthVideo';

export type { AppView } from '@/store/appView';

export type {
  ProductImage,
  ProductData,
} from '@/types/product';

export type {
  GenerationTask,
  ChatSession,
  MediaAttachment,
  ProductWidgetData,
  AssistantMessage,
  AssistantSession,
} from '@/store/appStoreTypes';

export type WorkshopTab = 'studio' | 'prompt_assets' | 'recipes' | 'categories';

export interface ViewSlice {
  currentView: AppView;
  previousView: AppView | null;
  activeModuleId: string;
  activeWorkshopTab: WorkshopTab;
  isWorkshopConfigOpen: boolean;
  setCurrentView: (view: AppView) => void;
  navigateToSettings: () => void;
  backFromSettings: () => void;
  setActiveModuleId: (id: string) => void;
  setActiveWorkshopTab: (tab: WorkshopTab) => void;
  setIsWorkshopConfigOpen: (open: boolean) => void;
}

export interface HomeSlice {
  quickGenMode: QuickGenMode;
  quickDepthStyle: DepthVideoStyle;
  quickDepthQuality: DepthQuality;
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
  setQuickGenMode: (mode: QuickGenMode) => void;
  setQuickDepthStyle: (style: DepthVideoStyle) => void;
  setQuickDepthQuality: (quality: DepthQuality) => void;
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
  generationTasks: GenerationTask[];
  createSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, newTitle: string) => void;
  pinSession: (id: string) => void;
  renameTask: (taskId: string, newTitle: string) => void;
  setPreviewTask: (task: GenerationTask | null, queue?: GenerationTask[]) => void;
  setPreviewQueue: (queue: GenerationTask[]) => void;
  addGenerationTask: (task: GenerationTask, isNewSession?: boolean) => void;
  addBatchGenerationTasks: (tasks: GenerationTask[], customTitle?: string, isNewSession?: boolean) => void;
  updateGenerationTask: (id: string, updates: Partial<GenerationTask>, opts?: { persist?: boolean }) => void;
  deleteGenerationTask: (id: string) => void;
  deleteGenerationPermanently: (ids: string[], urls?: string[]) => void;
  syncDatabaseTasks: (tasks: GenerationTask[]) => void;
}

export type WorkshopMode = 'storyboard_generate';

export interface WorkshopModeSession {
  currentStep: number;
  product: ProductWidgetData | ProductData | null;
  images: ProductImage[];
  apiUsed: string | null;
  clonedSocialImages: { url: string; selected: boolean }[];
  socialGalleryTab: 'social' | 'product';
  generatedPrompts: ShotPrompt[];
  shotCount: number;
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
  workshopTasks: GenerationTask[];
  selectedAspectId: string;
  selectedQuality: 'high' | 'medium' | 'low';
  useReferenceImage: boolean;
  isBatchGenerating: boolean;
  copywritingTitle?: string;
  copywritingContent?: string;
  copywritingFull?: string;
}

export interface WorkshopSlice {
  /** 兼容旧会话缓存的预留字段。 */
  socialSessionCache: WorkshopModeSession;
  /** 原创生成模式独立会话缓存 */
  originalSessionCache: WorkshopModeSession;
  currentStep: number;
  /** 种草工坊批次阶段，与 URL ?step= 同步。 */
  batchStage: number;
  product: ProductWidgetData | ProductData | null;
  images: ProductImage[];
  apiUsed: string | null;
  isLoading: boolean;
  error: string | null;
  selectedVisionModel: string;
  /** 原创批量「拍摄架构」选中项（全局偏好，与 Batch selectedArchId 同步） */
  selectedArchId: string;
  shotCount: number;
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
  workshopTasks: GenerationTask[];
  workshopMode: WorkshopMode;
  socialGalleryTab: 'social' | 'product';
  clonedSocialImages: { url: string; selected: boolean }[];
  modelPersona: string;
  /** 旧版会话正脸字段。 */
  anchorFaceImageUrl?: string;
  isAnchorFaceConfirmed: boolean;
  /** 原创生成专属正脸（与爆款槽位隔离，避免遗留人脸泄漏） */
  originalAnchorFaceImageUrl?: string;
  originalIsAnchorFaceConfirmed: boolean;
  socialPromptSourceKey: string;
  /** 提示词库「载入分镜」→ 批量工坊的一次性桥接载荷 */
  pendingBatchPromptImport: {
    productTitle?: string;
    productFingerprint?: string;
    prompts: ShotPrompt[];
    /** 图组母本及同组参考图：载入后直接带入分镜联动生成。 */
    referenceImages?: string[];
    masterImageIndex?: number;
  } | null;
  /** 资产中心/配方库载入后跳转批量工坊阶段（1–4），消费后清空 */
  pendingBatchStage: number | null;
  /** 资产中心「应用」一键桥接锁定到批量工坊原子资产（置景/穿搭/人设），消费后清空 */
  pendingBatchLockedAssets: {
    sceneId?: string;
    outfitId?: string;
    personaId?: string;
    actionId?: string;
    fullPromptId?: string;
  } | null;
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
  setBatchStage: (stage: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProductData: (product: ProductWidgetData | ProductData | null, images: { main: string[]; details: string[]; skus: string[] }, apiUsed?: string) => void;
  toggleImageSelection: (index: number) => void;
  selectAllImages: (type?: 'main' | 'detail' | 'sku') => void;
  clearSelection: () => void;
  deselectAllImages: () => void;
  setSelectedVisionModel: (model: string) => void;
  setSelectedArchId: (archId: string) => void;
  setShotCount: (count: number) => void;
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
  setPendingBatchPromptImport: (
    payload: WorkshopSlice['pendingBatchPromptImport'],
  ) => void;
  setPendingBatchStage: (stage: number | null) => void;
  setPendingBatchLockedAssets: (
    payload: WorkshopSlice['pendingBatchLockedAssets']
  ) => void;
  updateShotPrompt: (index: number, newPrompt: Partial<ShotPrompt>) => void;
  toggleShotSelection: (index: number) => void;
  addShotPrompt: (prompt?: Partial<ShotPrompt>) => void;
  deleteShotPrompt: (index: number) => void;
  setSelectedImageGenModel: (model: string) => void;
  setSelectedAspectId: (aspectId: string) => void;
  setSelectedQuality: (quality: 'high' | 'medium' | 'low') => void;
  setUseReferenceImage: (useRef: boolean) => void;
  setIsBatchGenerating: (isGenerating: boolean) => void;
  initWorkshopTasks: (forceReset?: boolean) => void;
  updateWorkshopTask: (id: string, updates: Partial<GenerationTask>) => void;
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
  updateAssistantSession: (session: Partial<AssistantSession> & { id: string }) => void;
  addAssistantMessage: (sessionId: string, message: AssistantMessage) => void;
  updateAssistantMessage: (sessionId: string, messageId: string, updates: Partial<AssistantMessage>) => void;
  persistAssistantNow: () => void;
  hydrateAssistantSessions: () => Promise<void>;
  setAssistantAttachments: (attachments: MediaAttachment[]) => void;
  addAssistantAttachment: (att: MediaAttachment) => void;
  removeAssistantAttachment: (index: number) => void;
  clearAssistantAttachments: () => void;
}

export type { BrandKitSlice } from '@/store/brandKitSlice';
export type { AssistantSkillSlice } from '@/store/assistantSkillSlice';
import type { BrandKitSlice } from '@/store/brandKitSlice';
import type { AssistantSkillSlice } from '@/store/assistantSkillSlice';

export type AppState = ViewSlice & HomeSlice & GenerateSlice & WorkshopSlice & AssistantSlice & BrandKitSlice & AssistantSkillSlice;
