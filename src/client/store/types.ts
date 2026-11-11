import type { ImageOutputTier } from '@shared/domain/media/imageCapabilities';
import type { BrandKitProfile } from '@shared/domain/products/brandKitModels';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import type { SkillLibrary } from '@shared/domain/skills/library';
import type { ProductWidgetData } from '@client/store/appStoreTypes';
import type {
  AssistantMessage,
  AssistantSession,
  ChatSession,
  GenerationTask,
  MediaAttachment,
} from '@client/store/appStoreTypes';
import type { AppView } from '@client/store/appView';
import type { DepthQuality, DepthVideoStyle, QuickGenMode } from '@shared/domain/media/depthVideo';

export type { AppView } from '@client/store/appView';

export type ImageCategoryType = 'main' | 'sku' | 'detail';

export interface ProductImage {
  url: string;
  type: ImageCategoryType;
  selected: boolean;
}

export interface ProductData {
  id?: string;
  itemId?: string;
  skuId?: string;
  title: string;
  platform?: string;
  price?: string | number;
  picUrl?: string;
  detailUrls?: string;
  props?: Record<string, string>;
  createdAt?: string | Date;
}

export type {
  GenerationTask,
  ChatSession,
  MediaAttachment,
  ProductWidgetData,
  AssistantMessage,
  AssistantSession,
} from '@client/store/appStoreTypes';

export interface ViewSlice {
  currentView: AppView;
  previousView: AppView | null;
  setCurrentView: (view: AppView) => void;
  navigateToSettings: () => void;
  backFromSettings: () => void;
}

export interface HomeSlice {
  quickGenMode: QuickGenMode;
  quickDepthStyle: DepthVideoStyle;
  quickDepthQuality: DepthQuality;
  quickPrompt: string;
  pendingAttachmentReads: number;
  invalidatePromptAttachments: () => void;
  readPromptAttachments: (read: (isCurrent: () => boolean, signal: AbortSignal) => Promise<unknown>) => Promise<void>;
  quickRefImage: string | null;
  quickRefImages: string[];
  quickModel: string;
  quickAspectId: string;
  quickQuality: ImageOutputTier;
  quickCount: number;
  quickAudioModel: string;
  quickVideoModel: string;
  quickVideoDuration: number;
  quickVideoContextIrEnabled: boolean;
  quickVideoResolution: '360P' | '480P' | '540P' | '720P' | '768P' | '1080P' | '2K' | '4K';
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
  setQuickQuality: (quality: ImageOutputTier) => void;
  setQuickCount: (count: number) => void;
  setQuickAudioModel: (model: string) => void;
  setQuickVideoModel: (model: string) => void;
  setQuickVideoDuration: (duration: number) => void;
  setQuickVideoContextIrEnabled: (enabled: boolean) => void;
  setQuickVideoResolution: (resolution: '360P' | '480P' | '540P' | '720P' | '768P' | '1080P' | '2K' | '4K') => void;
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
  generationHistoryReady: boolean;
  sessions: ChatSession[];
  currentSessionId: string;
  previewTask: GenerationTask | null;
  previewQueue: GenerationTask[];
  generationTasks: GenerationTask[];
  createSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  deleteAllSessions: () => void;
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

export interface WorkshopSlice {
  product: ProductWidgetData | ProductData | null;
  images: ProductImage[];
  apiUsed: string | null;
  selectedVisionModel: string;
  selectedArchId: string;
  setProductData: (product: ProductWidgetData | ProductData | null, images: { main: string[]; details: string[]; skus: string[] }, apiUsed?: string) => void;
  setSelectedVisionModel: (model: string) => void;
  setSelectedArchId: (archId: string) => void;
}

export interface AssistantSlice {
  isAssistantOpen: boolean;
  assistantSessions: AssistantSession[];
  currentAssistantSessionId: string;
  assistantModel: string;
  assistantHistoryLimit: number;
  assistantAttachments: MediaAttachment[];
  assistantInputDraft: string;
  /** Unsaved text belongs to its conversation, never to the next new chat. */
  assistantSessionDrafts: Record<string, string>;
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
  hydrateAssistantSessions: (signal?: AbortSignal) => Promise<void>;
  setAssistantAttachments: (attachments: MediaAttachment[]) => void;
  addAssistantAttachment: (att: MediaAttachment) => void;
  removeAssistantAttachment: (index: number) => void;
  clearAssistantAttachments: () => void;
}


export interface BrandKitSlice {
  brandKits: BrandKitProfile[];
  activeBrandKitId: string | null;
  setActiveBrandKitId: (id: string | null) => void;
  addBrandKit: (kit: BrandKitProfile) => void;
  updateBrandKit: (id: string, updates: Partial<BrandKitProfile>) => void;
  deleteBrandKit: (id: string) => void;
  getActiveBrandKit: () => BrandKitProfile | null;
}

export interface AssistantSkillSlice {
  assistantCustomSkills: AssistantSkill[];
  assistantSkillsError: string | null;
  refreshAssistantSkills: () => Promise<SkillLibrary>;
  activeAssistantSkillId: string | null;
  activeAssistantSkillSnapshot: AssistantSkill | null;
  setActiveAssistantSkillId: (id: string | null) => void;
  addAssistantSkill: (skill: AssistantSkill) => Promise<void>;
  updateAssistantSkill: (id: string, updates: Partial<AssistantSkill>) => Promise<void>;
  deleteAssistantSkill: (id: string) => Promise<void>;
  getAllAssistantSkills: () => AssistantSkill[];
  getActiveAssistantSkill: () => AssistantSkill | null;
  importAssistantSkillFromFile: (file: File) => Promise<AssistantSkill>;
}

export type AppState = ViewSlice & HomeSlice & GenerateSlice & WorkshopSlice & AssistantSlice & BrandKitSlice & AssistantSkillSlice;
