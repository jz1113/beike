import { create } from 'zustand';
import { ShotPrompt } from '@/lib/vision';
import { ASPECT_RATIOS } from '@/lib/drawing';
import { ProductData } from '@/types';

export type { ProductData };

export interface ProductImage {
  url: string;
  type: 'main' | 'detail' | 'sku';
  selected: boolean;
}

export interface GenerationTask {
  id: string; // unique shot key e.g. "shot-0" or "fast-xxx"
  batchId?: string; // 任务批次ID，支持同一任务批次内多图并排，不同任务换行隔离
  shotNo?: number;
  title: string;
  prompt: string;
  scene?: string; // 🌟 场景机位说明
  camera_focal_length?: string; // 🌟 镜头焦段
  angle?: string; // 🌟 拍摄角度
  lighting_type?: string; // 🌟 采光属性
  model: string;
  size: string;
  quality: string;
  has_human?: boolean; // 🌟 是否包含人物/模特 (false: 纯静物/无人物)
  shot_type?: 'model_shot' | 'hand_held_only' | 'pure_product'; // 🌟 分镜类型
  mediaType?: 'image' | 'video'; // 🌟 媒体类型：图片生图 or 视频生成
  videoDuration?: number; // 视频时长 (秒: 4, 5, 8, 10)
  videoResolution?: string; // 视频分辨率 ('720P' | '1080P' | '4K')
  videoRefMode?: string; // 视频参考模式 ('omni' | 'first_last_frame' | ...)
  productImageUrl?: string; // 🌟 该分镜绑定的具体商品实物图（正面/背面/侧面/细节）
  referenceImageUrl?: string;
  referenceImages?: string[]; // 🌟 多参考素材/首尾帧列表
  images?: string[]; // 🌟 多模态引用素材列表
  useReferenceImage: boolean;
  status: 'IDLE' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';
  progress: string;
  taskId?: string;
  dbId?: string;
  resultUrl?: string;
  failReason?: string;
  createdAt?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  isPinned?: boolean;
  tasks: GenerationTask[];
}

export interface MediaAttachment {
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  name?: string;
  size?: number;
}

export interface ProductWidgetData {
  id?: string;
  itemId: string;
  platform: string;
  title: string;
  price?: number | string;
  category?: string;
  picUrl?: string;
  mainImages: string[];
  detailImages: string[];
  skuImages: string[];
  allImages: string[];
  props?: Record<string, string>;
  author?: string;
  videoUrl?: string | null;
  coreSpecs?: { label: string; value: string }[];
  sellingPoints?: string[];
  apiUsed?: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: MediaAttachment[];
  timestamp: number;
  modelUsed?: string;
  productWidget?: ProductWidgetData; // 🌟 挂载的电商抓取结果与交互式选图卡片
}

export interface AssistantSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AssistantMessage[];
}

interface AppState {
  // 当前视图模式 ('hub': 创作大厅首页, 'generate': 实时生图工作区, 'buyer_show': 买家秀独立工坊, 'assets': 资产中心)
  currentView: 'hub' | 'generate' | 'buyer_show' | 'assets';

  // 当前全局功能模块 ID
  activeModuleId: string;

  // 当前工作流步骤 (1: 素材准备, 2: 视觉分析, 3: AI生图, 4: 成果交付)
  currentStep: number;

  // 对话会话列表与当前会话
  sessions: ChatSession[];
  currentSessionId: string;

  // 图片全屏放大预览模态框状态
  previewTask: GenerationTask | null;

  // 快捷对话生图与视频状态
  hubGenMode: 'image' | 'video'; // 'image' | 'video'
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
  quickVideoFirstFrame: string | null; // 🌟 视频首帧图片
  quickVideoLastFrame: string | null;  // 🌟 视频尾帧图片
  quickVideoMultiFrames: string[];     // 🌟 智能多帧序列 [第1帧, 第2帧...]
  quickVideoCount: number;
  hubGenerations: GenerationTask[];

  // Step 1 状态
  product: any | null;
  images: ProductImage[];
  apiUsed: string | null;
  isLoading: boolean;
  error: string | null;

  // Step 2 视觉分析与提示词管理状态
  selectedVisionModel: string;
  selectedStyleId: string;
  shotCount: number;
  extraRequirements: string;
  isAnalyzing: boolean;
  productFingerprint: string;
  generatedPrompts: ShotPrompt[];

  // Step 3 生图状态
  selectedImageGenModel: string;
  selectedAspectId: string;
  selectedQuality: 'high' | 'medium' | 'low';
  useReferenceImage: boolean;
  isBatchGenerating: boolean;
  generationTasks: GenerationTask[];
  // 生产方向与工坊模式 ('storyboard_generate': 原生分镜策划模式, 'social_face_product_swap': 爆款换人换品工坊)
  workshopMode: 'storyboard_generate' | 'social_face_product_swap';
  socialGalleryTab: 'social' | 'product';
  clonedSocialImages: { url: string; selected: boolean }[];
  modelPersona: string;
  anchorFaceImageUrl?: string;
  isAnchorFaceConfirmed: boolean;

  // Actions
  setWorkshopMode: (mode: 'storyboard_generate' | 'social_face_product_swap') => void;
  setSocialGalleryTab: (tab: 'social' | 'product') => void;
  setTargetProductImage: (url: string) => void;
  setClonedSocialImages: (images: string[]) => void;
  toggleClonedSocialImage: (index: number) => void;
  selectAllClonedImages: (select: boolean) => void;
  setModelPersona: (persona: string) => void;
  setAnchorFaceImageUrl: (url?: string) => void;
  setIsAnchorFaceConfirmed: (confirmed: boolean) => void;
  setCurrentView: (view: 'hub' | 'generate' | 'buyer_show' | 'assets') => void;
  setActiveModuleId: (id: string) => void;
  setStep: (step: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setProductData: (product: any, images: { main: string[]; details: string[]; skus: string[] }, apiUsed?: string) => void;
  toggleImageSelection: (index: number) => void;
  selectAllImages: (type?: 'main' | 'detail' | 'sku') => void;
  clearSelection: () => void;
  deselectAllImages: () => void;

  // 会话与预览 Actions
  createSession: () => void;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, newTitle: string) => void;
  pinSession: (id: string) => void;
  renameTask: (taskId: string, newTitle: string) => void;
  setPreviewTask: (task: GenerationTask | null) => void;

  // 快捷对话生图与生视频 Actions
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
  addHubGeneration: (task: GenerationTask, isNewSession?: boolean) => void;
  addBatchHubGenerations: (tasks: GenerationTask[], customTitle?: string, isNewSession?: boolean) => void;
  updateHubGeneration: (id: string, updates: Partial<GenerationTask>) => void;
  deleteHubGeneration: (id: string) => void;
  deleteGenerationPermanently: (ids: string[], urls?: string[]) => void;
  syncDatabaseTasks: (tasks: GenerationTask[]) => void;

  // Step 2 Actions
  setSelectedVisionModel: (model: string) => void;
  setSelectedStyleId: (styleId: string) => void;
  setShotCount: (count: number) => void;
  setExtraRequirements: (text: string) => void;
  setIsAnalyzing: (isAnalyzing: boolean) => void;
  setGeneratedPrompts: (prompts: ShotPrompt[], fingerprint?: string) => void;
  updateShotPrompt: (index: number, newPrompt: Partial<ShotPrompt>) => void;
  toggleShotSelection: (index: number) => void;
  addShotPrompt: (prompt?: Partial<ShotPrompt>) => void;
  deleteShotPrompt: (index: number) => void;

  // Step 3 Actions
  setSelectedImageGenModel: (model: string) => void;
  setSelectedAspectId: (aspectId: string) => void;
  setSelectedQuality: (quality: 'high' | 'medium' | 'low') => void;
  setUseReferenceImage: (useRef: boolean) => void;
  setIsBatchGenerating: (isGenerating: boolean) => void;
  initGenerationTasks: (forceReset?: boolean) => void;
  updateGenerationTask: (id: string, updates: Partial<GenerationTask>) => void;
  setAllTasksStatus: (status: 'IDLE' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE') => void;

  // AI 助手状态与 Actions
  isAssistantOpen: boolean;
  assistantSessions: AssistantSession[];
  currentAssistantSessionId: string;
  assistantModel: string;
  assistantHistoryLimit: number;
  assistantAttachments: MediaAttachment[];
  setIsAssistantOpen: (open: boolean) => void;
  setAssistantModel: (model: string) => void;
  setAssistantHistoryLimit: (limit: number) => void;
  createAssistantSession: () => void;
  switchAssistantSession: (id: string) => void;
  deleteAssistantSession: (id: string) => void;
  renameAssistantSession: (id: string, title: string) => void;
  addAssistantMessage: (sessionId: string, message: AssistantMessage) => void;
  addAssistantAttachment: (att: MediaAttachment) => void;
  removeAssistantAttachment: (index: number) => void;
  clearAssistantAttachments: () => void;
}

const getStoredAssistantState = () => {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('ai_assistant_sessions');
      const savedId = localStorage.getItem('ai_assistant_current_session_id');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const currentId = savedId && parsed.some((s: any) => s.id === savedId) ? savedId : parsed[0].id;
          return { sessions: parsed, currentId };
        }
      }
    } catch {}
  }
  const defaultId = 'asst-session-default';
  return {
    sessions: [
      {
        id: defaultId,
        title: '新对话',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      }
    ],
    currentId: defaultId
  };
};

const getStoredDrawingSessions = () => {
  let sessions: ChatSession[] = [];
  let currentId = 'session-default';
  let allGenerations: GenerationTask[] = [];

  if (typeof window !== 'undefined') {
    try {
      const savedSessions = localStorage.getItem('drawing_sessions');
      const savedId = localStorage.getItem('drawing_current_session_id');
      const savedAll = localStorage.getItem('drawing_all_generations');
      if (savedSessions) {
        const parsed = JSON.parse(savedSessions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          sessions = parsed;
          currentId = (savedId && (parsed.some((s: any) => s.id === savedId) || savedId === '__all__')) ? savedId : parsed[0].id;
        }
      }
      if (savedAll) {
        const parsedAll = JSON.parse(savedAll);
        if (Array.isArray(parsedAll)) {
          allGenerations = parsedAll;
        }
      }
    } catch {}
  }

  if (sessions.length === 0) {
    const defaultId = 'session-default';
    sessions = [
      {
        id: defaultId,
        title: '未命名对话',
        createdAt: Date.now(),
        tasks: []
      }
    ];
    currentId = defaultId;
  }

  // 聚合所有会话中的 tasks 与 allGenerations，合并去重
  const map = new Map<string, GenerationTask>();
  allGenerations.forEach(t => {
    const key = t.id || t.taskId;
    if (key) map.set(key, t);
  });
  sessions.forEach(s => {
    (s.tasks || []).forEach(t => {
      const key = t.id || t.taskId;
      if (key && !map.has(key)) map.set(key, t);
    });
  });

  const mergedGenerations = Array.from(map.values()).sort((a, b) => {
    const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
    const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
    return tB - tA;
  });

  return {
    sessions,
    currentId,
    tasks: mergedGenerations
  };
};

export const useAppStore = create<AppState>((set, get) => {
  const initialAsst = getStoredAssistantState();
  const initialDrawing = getStoredDrawingSessions();

  return {
    currentView: 'hub',
    activeModuleId: 'buyer_show',
    currentStep: 1,

    // 对话会话列表与当前会话 (持久化)
    sessions: initialDrawing.sessions,
    currentSessionId: initialDrawing.currentId,
    previewTask: null,

    // 快捷对话生图与视频默认状态
    hubGenMode: 'image',
    quickPrompt: '',
    quickRefImage: null,
    quickRefImages: [],
    quickModel: 'gpt-image-2',
    quickAspectId: '3:4',
    quickQuality: 'high',
    quickCount: 1,
    quickVideoModel: 'doubao-seedance-2.0-mini',
    quickVideoDuration: 5,
    quickVideoResolution: '720P',
    quickVideoAspectId: '16:9',
    quickVideoRefMode: 'omni',
    quickVideoFirstFrame: null,
    quickVideoLastFrame: null,
    quickVideoMultiFrames: [],
    quickVideoCount: 1,
    hubGenerations: initialDrawing.tasks,

    // Step 1
    product: null,
    images: [],
    apiUsed: null,
    isLoading: false,
    error: null,

    // Step 2
    selectedVisionModel: typeof window !== 'undefined' 
      ? (localStorage.getItem('ai_multimodal_model') || localStorage.getItem('ai_vision_model') || 'gpt-5.6-luna')
      : 'gpt-5.6-luna',
    selectedStyleId: 'computer_office_monitor',
    shotCount: 4,
    extraRequirements: '',
    isAnalyzing: false,
    productFingerprint: '',
    generatedPrompts: [],

    // Step 3
    selectedImageGenModel: typeof window !== 'undefined'
      ? (localStorage.getItem('ai_image_gen_model') || 'gpt-image-2')
      : 'gpt-image-2',
    selectedAspectId: '3:4',
    selectedQuality: 'high',
    useReferenceImage: true,
    isBatchGenerating: false,
    generationTasks: [],
    // 生产方向与工坊模式 (默认开启爆款复刻工坊)
    workshopMode: 'social_face_product_swap',
    socialGalleryTab: 'social',
    clonedSocialImages: [],
    modelPersona: typeof window !== 'undefined' 
      ? (localStorage.getItem('drawing_model_persona') || '🌸 亚洲清纯甜美女生 (日常精致微表情、自然裸妆感)')
      : '🌸 亚洲清纯甜美女生 (日常精致微表情、自然裸妆感)',
    anchorFaceImageUrl: typeof window !== 'undefined' 
      ? (localStorage.getItem('anchor_face_image_url') || undefined)
      : undefined,
    isAnchorFaceConfirmed: typeof window !== 'undefined' 
      ? Boolean(localStorage.getItem('anchor_face_image_url'))
      : false,

    // Actions
    setWorkshopMode: (workshopMode) => set((state) => {
      if (workshopMode === 'social_face_product_swap') {
        const selectedCount = state.clonedSocialImages.filter(i => i.selected).length;
        return { 
          workshopMode, 
          shotCount: selectedCount > 0 ? selectedCount : state.shotCount 
        };
      }
      return { workshopMode };
    }),
    setSocialGalleryTab: (socialGalleryTab) => set({ socialGalleryTab }),
    setTargetProductImage: (url) => set((state) => {
      const updatedProduct = state.product ? { ...state.product, picUrl: url } : { title: '目标实物商品', picUrl: url };
      const updatedImages = state.images.map(img => ({
        ...img,
        selected: img.url === url
      }));

      // 异步同步到数据库，确保只持久化用户当前选定的实物图链接
      if (state.product?.id) {
        fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: state.product.id,
            picUrl: url,
            selectedImages: [url]
          })
        }).catch(() => {});
      }

      return {
        product: updatedProduct,
        images: updatedImages
      };
    }),
    setClonedSocialImages: (imgs) => set({
      clonedSocialImages: imgs.map(url => ({ url, selected: true })),
      shotCount: imgs.length > 0 ? imgs.length : 4
    }),
    toggleClonedSocialImage: (index) => set((state) => {
      const updated = [...state.clonedSocialImages];
      if (updated[index]) {
        updated[index] = { ...updated[index], selected: !updated[index].selected };
      }
      const selectedCount = updated.filter(i => i.selected).length;
      return { 
        clonedSocialImages: updated,
        shotCount: selectedCount > 0 ? selectedCount : state.shotCount
      };
    }),
    selectAllClonedImages: (select) => set((state) => {
      const updated = state.clonedSocialImages.map(img => ({ ...img, selected: select }));
      const selectedCount = updated.filter(i => i.selected).length;
      return {
        clonedSocialImages: updated,
        shotCount: selectedCount > 0 ? selectedCount : (select ? state.clonedSocialImages.length : state.shotCount)
      };
    }),
    setModelPersona: (modelPersona) => {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('drawing_model_persona', modelPersona);
        } catch {}
      }
      set({ modelPersona });
    },
    setAnchorFaceImageUrl: (anchorFaceImageUrl) => {
      if (typeof window !== 'undefined') {
        try {
          if (anchorFaceImageUrl) {
            localStorage.setItem('anchor_face_image_url', anchorFaceImageUrl);
          } else {
            localStorage.removeItem('anchor_face_image_url');
          }
        } catch {}
      }
      set({ 
        anchorFaceImageUrl, 
        isAnchorFaceConfirmed: Boolean(anchorFaceImageUrl) 
      });
    },
    setIsAnchorFaceConfirmed: (isAnchorFaceConfirmed) => set({ isAnchorFaceConfirmed }),

    setCurrentView: (currentView) => set({ currentView }),
    setActiveModuleId: (activeModuleId) => set({ activeModuleId }),
    setStep: (currentStep) => set({ currentStep }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (error) => set({ error }),

  // 会话与大图预览
  createSession: () => set((state) => {
    const newSessionId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: '未命名对话',
      createdAt: Date.now(),
      tasks: []
    };
    const updatedSessions = [newSession, ...state.sessions];
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_sessions', JSON.stringify(updatedSessions));
        localStorage.setItem('drawing_current_session_id', newSessionId);
      } catch {}
    }
    return {
      sessions: updatedSessions,
      currentSessionId: newSessionId,
      quickPrompt: '',
      quickRefImage: null,
      quickRefImages: []
    };
  }),

  switchSession: (id) => set((state) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_current_session_id', id);
      } catch {}
    }
    return {
      currentSessionId: id
    };
  }),

  deleteSession: (id) => set((state) => {
    const filtered = state.sessions.filter(s => s.id !== id);

    let nextSessionId = state.currentSessionId;
    if (state.currentSessionId === id) {
      nextSessionId = filtered.length > 0 ? filtered[0].id : '__all__';
    }

    let nextSessions = filtered;
    if (nextSessions.length === 0) {
      const defaultId = `session-${Date.now()}`;
      nextSessions = [{
        id: defaultId,
        title: '未命名对话',
        createdAt: Date.now(),
        tasks: []
      }];
      if (nextSessionId !== '__all__') {
        nextSessionId = defaultId;
      }
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_sessions', JSON.stringify(nextSessions));
        localStorage.setItem('drawing_current_session_id', nextSessionId);
      } catch {}
    }

    return {
      sessions: nextSessions,
      currentSessionId: nextSessionId
    };
  }),

  renameSession: (id, newTitle) => set((state) => {
    const updated = state.sessions.map(s => s.id === id ? { ...s, title: newTitle.trim() || '未命名对话' } : s);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_sessions', JSON.stringify(updated));
      } catch {}
    }
    return { sessions: updated };
  }),

  pinSession: (id) => set((state) => {
    const updated = state.sessions.map(s => s.id === id ? { ...s, isPinned: !s.isPinned } : s);
    // 置顶项排在最前面
    updated.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.createdAt - a.createdAt;
    });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_sessions', JSON.stringify(updated));
      } catch {}
    }
    return { sessions: updated };
  }),

  renameTask: (taskId, newTitle) => set((state) => {
    const updatedHubGens = state.hubGenerations.map(t => t.id === taskId ? { ...t, title: newTitle } : t);
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.map(t => t.id === taskId ? { ...t, title: newTitle } : t)
    }));
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_sessions', JSON.stringify(updatedSessions));
      } catch {}
    }
    return {
      hubGenerations: updatedHubGens,
      sessions: updatedSessions,
      previewTask: state.previewTask?.id === taskId ? { ...state.previewTask, title: newTitle } : state.previewTask
    };
  }),

  setPreviewTask: (previewTask) => set({ previewTask }),

  setProductData: (product, imagesInput, apiUsed) => {
    const toArray = (val: any): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.map(String).filter(Boolean);
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch {}
        return [val].filter(Boolean);
      }
      return [];
    };

    const rawMain = imagesInput?.main;
    const rawDetails = imagesInput?.details;
    const rawSkus = imagesInput?.skus;

    const mainList = toArray(rawMain);
    const skusList = toArray(rawSkus);
    const detailsList = toArray(rawDetails);

    const formattedImages: ProductImage[] = [
      ...mainList.map(url => ({ url, type: 'main' as const, selected: false })),
      ...skusList.map(url => ({ url, type: 'sku' as const, selected: false })),
      ...detailsList.map(url => ({ url, type: 'detail' as const, selected: false }))
    ];

    // 如果还没有设置参考图，默认设置商品首图
    const firstImg = formattedImages[0]?.url || null;

    set({
      product,
      images: formattedImages,
      apiUsed: apiUsed || null,
      error: null,
      currentStep: 1,
      currentView: 'buyer_show',
      quickRefImage: firstImg || get().quickRefImage
    });
  },

  toggleImageSelection: (index) => set((state) => {
    const newImages = [...state.images];
    if (newImages[index]) {
      newImages[index].selected = !newImages[index].selected;
    }
    return { images: newImages };
  }),

  selectAllImages: (type) => set((state) => {
    const newImages = state.images.map(img => {
      if (!type || img.type === type) {
        return { ...img, selected: true };
      }
      return img;
    });
    return { images: newImages };
  }),

  clearSelection: () => set((state) => {
    const newImages = state.images.map(img => ({ ...img, selected: false }));
    return { images: newImages };
  }),

  deselectAllImages: () => set((state) => {
    const newImages = state.images.map(img => ({ ...img, selected: false }));
    return { images: newImages };
  }),

  // 快捷对话生图与视频 Actions
  setHubGenMode: (hubGenMode) => set({ hubGenMode }),
  setQuickPrompt: (quickPrompt) => set({ quickPrompt }),
  setQuickRefImage: (quickRefImage) => set({ 
    quickRefImage,
    quickRefImages: quickRefImage ? [quickRefImage] : []
  }),
  setQuickRefImages: (quickRefImages) => set({ 
    quickRefImages,
    quickRefImage: quickRefImages[0] || null
  }),
  addQuickRefImage: (url) => set((state) => {
    const newImages = [...state.quickRefImages, url];
    return {
      quickRefImages: newImages,
      quickRefImage: newImages[0] || null
    };
  }),
  removeQuickRefImage: (index) => set((state) => {
    const newImages = state.quickRefImages.filter((_, i) => i !== index);
    return {
      quickRefImages: newImages,
      quickRefImage: newImages[0] || null
    };
  }),
  setQuickModel: (quickModel) => set({ quickModel }),
  setQuickAspectId: (quickAspectId) => set({ quickAspectId }),
  setQuickQuality: (quickQuality) => set({ quickQuality }),
  setQuickCount: (quickCount) => set({ quickCount }),
  setQuickVideoModel: (quickVideoModel) => set({ quickVideoModel }),
  setQuickVideoDuration: (quickVideoDuration) => set({ quickVideoDuration }),
  setQuickVideoResolution: (quickVideoResolution) => set({ quickVideoResolution }),
  setQuickVideoAspectId: (quickVideoAspectId) => set({ quickVideoAspectId }),
  setQuickVideoRefMode: (quickVideoRefMode) => set({ quickVideoRefMode }),
  setQuickVideoFirstFrame: (quickVideoFirstFrame) => set({ quickVideoFirstFrame }),
  setQuickVideoLastFrame: (quickVideoLastFrame) => set({ quickVideoLastFrame }),
  swapVideoFirstLastFrames: () => set((state) => ({
    quickVideoFirstFrame: state.quickVideoLastFrame,
    quickVideoLastFrame: state.quickVideoFirstFrame
  })),
  setQuickVideoMultiFrames: (quickVideoMultiFrames) => set({ quickVideoMultiFrames }),
  addQuickVideoMultiFrame: (frame) => set((state) => ({
    quickVideoMultiFrames: [...state.quickVideoMultiFrames, frame]
  })),
  removeQuickVideoMultiFrame: (index) => set((state) => ({
    quickVideoMultiFrames: state.quickVideoMultiFrames.filter((_, i) => i !== index)
  })),
  setQuickVideoCount: (quickVideoCount) => set({ quickVideoCount }),
  
  addHubGeneration: (task, isNewSession = false) => set((state) => {
    const updatedHubGens = [task, ...state.hubGenerations.filter(g => g.id !== task.id && (!task.taskId || g.taskId !== task.taskId))];
    let sessions = [...state.sessions];
    let targetSessionId = state.currentSessionId;

    if (isNewSession) {
      const newSessionId = `session-${Date.now()}`;
      const newSession: ChatSession = {
        id: newSessionId,
        title: task.title ? task.title.slice(0, 18) : 'AI 生图创作',
        createdAt: Date.now(),
        tasks: [task]
      };
      sessions = [newSession, ...sessions];
      targetSessionId = newSessionId;
    } else {
      if (targetSessionId === '__all__' || sessions.length === 0 || !sessions.some(s => s.id === targetSessionId)) {
        const newSessionId = `session-${Date.now()}`;
        const newSession: ChatSession = {
          id: newSessionId,
          title: task.title ? task.title.slice(0, 18) : 'AI 生图创作',
          createdAt: Date.now(),
          tasks: [task]
        };
        sessions = [newSession, ...sessions];
        targetSessionId = newSessionId;
      } else {
        sessions = sessions.map(s => {
          if (s.id === targetSessionId) {
            return {
              ...s,
              tasks: [task, ...s.tasks.filter(t => t.id !== task.id && (!task.taskId || t.taskId !== task.taskId))]
            };
          }
          return s;
        });
      }
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_all_generations', JSON.stringify(updatedHubGens));
        localStorage.setItem('drawing_sessions', JSON.stringify(sessions));
        localStorage.setItem('drawing_current_session_id', targetSessionId);
      } catch {}
    }

    return {
      hubGenerations: updatedHubGens,
      sessions,
      currentSessionId: targetSessionId
    };
  }),

  addBatchHubGenerations: (tasks, customTitle, isNewSession = true) => set((state) => {
    const sharedBatchId = `batch-${Date.now()}`;
    const sharedTime = Date.now();
    const normalizedTasks = tasks.map(t => ({
      ...t,
      batchId: t.batchId || sharedBatchId,
      createdAt: t.createdAt || sharedTime
    }));

    const taskIds = new Set(normalizedTasks.map(t => t.id || t.taskId));
    const updatedHubGens = [...normalizedTasks, ...state.hubGenerations.filter(g => !taskIds.has(g.id) && (!g.taskId || !taskIds.has(g.taskId)))];
    let sessions = [...state.sessions];
    let targetSessionId = state.currentSessionId;

    if (isNewSession) {
      const newSessionId = `session-${Date.now()}`;
      const newSession: ChatSession = {
        id: newSessionId,
        title: customTitle || tasks[0]?.title?.slice(0, 18) || 'AI 批量分镜生图',
        createdAt: Date.now(),
        tasks: normalizedTasks
      };
      sessions = [newSession, ...sessions];
      targetSessionId = newSessionId;
    } else {
      if (targetSessionId === '__all__' || sessions.length === 0 || !sessions.some(s => s.id === targetSessionId)) {
        const newSessionId = `session-${Date.now()}`;
        const newSession: ChatSession = {
          id: newSessionId,
          title: customTitle || tasks[0]?.title?.slice(0, 18) || 'AI 批量分镜生图',
          createdAt: Date.now(),
          tasks: normalizedTasks
        };
        sessions = [newSession, ...sessions];
        targetSessionId = newSessionId;
      } else {
        sessions = sessions.map(s => {
          if (s.id === targetSessionId) {
            return {
              ...s,
              tasks: [...normalizedTasks, ...s.tasks.filter(t => !taskIds.has(t.id) && (!t.taskId || !taskIds.has(t.taskId)))]
            };
          }
          return s;
        });
      }
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_all_generations', JSON.stringify(updatedHubGens));
        localStorage.setItem('drawing_sessions', JSON.stringify(sessions));
        localStorage.setItem('drawing_current_session_id', targetSessionId);
      } catch {}
    }

    return {
      hubGenerations: updatedHubGens,
      sessions,
      currentSessionId: targetSessionId
    };
  }),

  updateHubGeneration: (id, updates) => set((state) => {
    const updatedHubGens = state.hubGenerations.map(g => (g.id === id || g.taskId === id) ? { ...g, ...updates } : g);
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.map(g => (g.id === id || g.taskId === id) ? { ...g, ...updates } : g)
    }));

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_all_generations', JSON.stringify(updatedHubGens));
        localStorage.setItem('drawing_sessions', JSON.stringify(updatedSessions));
      } catch {}
    }

    return {
      hubGenerations: updatedHubGens,
      sessions: updatedSessions,
      previewTask: (state.previewTask && (state.previewTask.id === id || (state.previewTask as any).taskId === id)) 
        ? ({ ...state.previewTask, ...updates } as GenerationTask) 
        : state.previewTask
    };
  }),

  // 🌟 删除对话中的单项记录（仅从会话与当前对话流中移除，绝不删除数据库/资产库中的实体）
  deleteHubGeneration: (id) => set((state) => {
    const updatedHubGens = state.hubGenerations.filter(g => g.id !== id && g.taskId !== id);
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.filter(g => g.id !== id && g.taskId !== id)
    }));

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_all_generations', JSON.stringify(updatedHubGens));
        localStorage.setItem('drawing_sessions', JSON.stringify(updatedSessions));
      } catch {}
    }

    return {
      hubGenerations: updatedHubGens,
      sessions: updatedSessions,
      previewTask: (state.previewTask?.id === id || (state.previewTask as any)?.taskId === id) ? null : state.previewTask
    };
  }),

  // 🌟 彻底物理删除生成记录 (同步清理本地会话、全局生成历史与 localStorage 缓存)
  deleteGenerationPermanently: (ids: string[], urls?: string[]) => set((state) => {
    const idSet = new Set((ids || []).filter(Boolean));
    const urlSet = new Set((urls || []).filter(Boolean));

    const updatedHubGens = state.hubGenerations.filter(g => 
      !idSet.has(g.id) && 
      (!g.taskId || !idSet.has(g.taskId)) &&
      (!g.resultUrl || !urlSet.has(g.resultUrl))
    );
    const updatedSessions = state.sessions.map(s => ({
      ...s,
      tasks: s.tasks.filter(g => 
        !idSet.has(g.id) && 
        (!g.taskId || !idSet.has(g.taskId)) &&
        (!g.resultUrl || !urlSet.has(g.resultUrl))
      )
    }));

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_all_generations', JSON.stringify(updatedHubGens));
        localStorage.setItem('drawing_sessions', JSON.stringify(updatedSessions));
      } catch {}
    }

    const isPreviewDeleted = state.previewTask && (
      idSet.has(state.previewTask.id) || 
      ((state.previewTask as any)?.taskId && idSet.has((state.previewTask as any).taskId)) || 
      (state.previewTask.resultUrl && urlSet.has(state.previewTask.resultUrl))
    );

    return {
      hubGenerations: updatedHubGens,
      sessions: updatedSessions,
      previewTask: isPreviewDeleted ? null : state.previewTask
    };
  }),

  syncDatabaseTasks: (dbTasks) => set((state) => {
    if (!dbTasks || dbTasks.length === 0) return state;

    // 1. 全局生成历史合并 (去重并按创建时间倒序)
    const taskMap = new Map<string, GenerationTask>();
    state.hubGenerations.forEach(t => {
      const key = t.id || t.taskId;
      if (key) taskMap.set(key, t);
    });
    dbTasks.forEach(dt => {
      const key = dt.id || dt.taskId;
      if (key) {
        const existing = taskMap.get(key);
        taskMap.set(key, existing ? { ...existing, ...dt } : dt);
      }
    });

    const allGens = Array.from(taskMap.values()).sort((a, b) => {
      const tA = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
      const tB = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    // 2. 如果用户只有 1 个空白的未命名会话，将 dbTasks 挂载进该会话供快速浏览
    let updatedSessions = [...state.sessions];
    const isBrandNewWorkspace = updatedSessions.length === 1 && updatedSessions[0].tasks.length === 0;
    if (isBrandNewWorkspace) {
      updatedSessions = updatedSessions.map(s => ({
        ...s,
        title: allGens[0]?.title || allGens[0]?.prompt?.slice(0, 16) || '未命名对话',
        tasks: allGens
      }));
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('drawing_all_generations', JSON.stringify(allGens));
        localStorage.setItem('drawing_sessions', JSON.stringify(updatedSessions));
      } catch {}
    }

    return {
      hubGenerations: allGens,
      sessions: updatedSessions
    };
  }),

  // Step 2 Actions
  setSelectedVisionModel: (selectedVisionModel) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ai_multimodal_model', selectedVisionModel);
      localStorage.setItem('ai_vision_model', selectedVisionModel);
    }
    set({ selectedVisionModel });
  },
  setSelectedStyleId: (selectedStyleId) => set({ selectedStyleId }),
  setShotCount: (shotCount) => set({ shotCount }),
  setExtraRequirements: (extraRequirements) => set({ extraRequirements }),
  setIsAnalyzing: (isAnalyzing) => set({ isAnalyzing }),
  
  setGeneratedPrompts: (generatedPrompts, productFingerprint) => {
    set({ 
      generatedPrompts, 
      ...(productFingerprint ? { productFingerprint } : {}) 
    });
    // 当生成或更新分镜时，立即根据新分镜同步重置生图任务槽位
    get().initGenerationTasks(true);
  },

  updateShotPrompt: (index, newPrompt) => set((state) => {
    const newPrompts = [...state.generatedPrompts];
    if (newPrompts[index]) {
      newPrompts[index] = { ...newPrompts[index], ...newPrompt };
    }
    const updatedTasks = state.generationTasks.map((task, tIdx) => {
      if (tIdx === index && newPrompt.productImageUrl) {
        return { ...task, productImageUrl: newPrompt.productImageUrl };
      }
      return task;
    });
    return { generatedPrompts: newPrompts, generationTasks: updatedTasks };
  }),

  toggleShotSelection: (index) => set((state) => {
    const newPrompts = [...state.generatedPrompts];
    if (newPrompts[index]) {
      newPrompts[index].selected = newPrompts[index].selected === false ? true : false;
    }
    return { generatedPrompts: newPrompts };
  }),

  addShotPrompt: (prompt) => set((state) => {
    const nextShotNo = state.generatedPrompts.length + 1;
    const newShot: ShotPrompt = {
      shot_no: nextShotNo,
      title: `自定义分镜 ${nextShotNo}`,
      prompt: prompt?.prompt || '商品特写与自然环境交互拍摄，真实柔和自然光...',
      selected: true,
      ...prompt
    };
    return { generatedPrompts: [...state.generatedPrompts, newShot] };
  }),

  deleteShotPrompt: (index) => set((state) => {
    const filtered = state.generatedPrompts.filter((_, i) => i !== index);
    const reindexed = filtered.map((item, i) => ({ ...item, shot_no: i + 1 }));
    return { generatedPrompts: reindexed };
  }),

  // Step 3 Actions
  setSelectedImageGenModel: (selectedImageGenModel) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ai_image_gen_model', selectedImageGenModel);
      } catch {}
    }
    set((state) => {
      const updatedTasks = state.generationTasks.map(t => 
        t.status !== 'SUCCESS' ? { ...t, model: selectedImageGenModel } : t
      );
      return { selectedImageGenModel, generationTasks: updatedTasks };
    });
  },

  setSelectedAspectId: (selectedAspectId) => set((state) => {
    const aspect = ASPECT_RATIOS.find(a => a.id === selectedAspectId) || ASPECT_RATIOS.find(a => a.id === '3:4') || ASPECT_RATIOS[0];
    const updatedTasks = state.generationTasks.map(t => 
      t.status !== 'SUCCESS' ? { ...t, size: aspect.size } : t
    );
    return { selectedAspectId, generationTasks: updatedTasks };
  }),

  setSelectedQuality: (selectedQuality) => set((state) => {
    const updatedTasks = state.generationTasks.map(t => 
      t.status !== 'SUCCESS' ? { ...t, quality: selectedQuality } : t
    );
    return { selectedQuality, generationTasks: updatedTasks };
  }),

  setUseReferenceImage: (useReferenceImage) => set((state) => {
    const updatedTasks = state.generationTasks.map(t => 
      t.status !== 'SUCCESS' ? { ...t, useReferenceImage } : t
    );
    return { useReferenceImage, generationTasks: updatedTasks };
  }),

  setIsBatchGenerating: (isBatchGenerating) => set({ isBatchGenerating }),

  initGenerationTasks: (forceReset = false) => {
    const state = get();
    const selectedPrompts = state.generatedPrompts.filter(p => p.selected !== false);
    const effectivePrompts = selectedPrompts.length > 0 ? selectedPrompts : state.generatedPrompts;
    const aspect = ASPECT_RATIOS.find(a => a.id === state.selectedAspectId) || ASPECT_RATIOS[0];
    
    // 获取用户当前勾选的商品底图列表
    const userSelectedImages = state.images.filter(img => img.selected);
    const effectiveImages = userSelectedImages.length > 0 ? userSelectedImages : state.images.slice(0, 4);
    const primarySelectedImage = effectiveImages[0];
    const selectedClonedList = state.clonedSocialImages.filter(i => i.selected);

    const tasks: GenerationTask[] = effectivePrompts.map((p, idx) => {
      // 🌟 1. 商品实物素材图精准绑定 (分镜显式指定 > 严格 1对1 槽位分配用户勾选底图)
      const shotProductImage = p.productImageUrl || effectiveImages[idx % effectiveImages.length]?.url || primarySelectedImage?.url;

      // 换人换品工坊下，每个分镜精准绑定其对应的已勾选社媒参考图作为垫图/ControlNet基准
      const shotRefImage = state.workshopMode === 'social_face_product_swap'
        ? (selectedClonedList[idx]?.url || primarySelectedImage?.url)
        : primarySelectedImage?.url;

      const existing = state.generationTasks.find(t => t.id === `shot-${idx}`);

      // 仅当非强制重置、且提示词内容未发生变化、且参考底图一致、且已有成功结果时，才保留旧图结果；
      // 换新任务/换商品/修改提示词/点击强制重置时，彻底初始化为崭新的待生成任务！
      if (
        !forceReset &&
        existing &&
        existing.status === 'SUCCESS' &&
        existing.resultUrl &&
        existing.prompt?.trim() === p.prompt?.trim() &&
        existing.referenceImageUrl === shotRefImage &&
        existing.productImageUrl === shotProductImage
      ) {
        return existing;
      }

      return {
        id: `shot-${idx}`,
        shotNo: p.shot_no || idx + 1,
        title: p.title || `分镜 ${idx + 1}`,
        prompt: p.prompt,
        scene: p.scene,
        camera_focal_length: p.camera_focal_length,
        angle: p.angle,
        lighting_type: p.lighting_type,
        model: state.selectedImageGenModel,
        size: aspect.size,
        quality: state.selectedQuality,
        has_human: p.has_human,
        shot_type: p.shot_type,
        productImageUrl: shotProductImage,
        referenceImageUrl: shotRefImage,
        useReferenceImage: state.workshopMode === 'social_face_product_swap' ? true : state.useReferenceImage,
        status: 'IDLE',
        progress: '0%',
        createdAt: Date.now()
      };
    });

    set({ generationTasks: tasks });
  },

  updateGenerationTask: (id, updates) => set((state) => {
    const newTasks = state.generationTasks.map(task => {
      if (task.id === id) {
        return { ...task, ...updates };
      }
      return task;
    });
    return { generationTasks: newTasks };
  }),

  setAllTasksStatus: (status) => set((state) => {
    const newTasks = state.generationTasks.map(t => ({ ...t, status }));
    return { generationTasks: newTasks };
  }),

  // AI 助手初始状态与 Actions
  isAssistantOpen: false,
  assistantSessions: initialAsst.sessions,
  currentAssistantSessionId: initialAsst.currentId,
  assistantModel: typeof window !== 'undefined'
    ? (localStorage.getItem('ai_assistant_model') || localStorage.getItem('ai_multimodal_model') || localStorage.getItem('ai_vision_model') || 'gpt-5.6-luna')
    : 'gpt-5.6-luna',
  assistantHistoryLimit: typeof window !== 'undefined' && localStorage.getItem('ai_assistant_history_limit') 
    ? Number(localStorage.getItem('ai_assistant_history_limit')) || 100 
    : 100,
  assistantAttachments: [],

  setIsAssistantOpen: (isAssistantOpen) => set({ isAssistantOpen }),
  setAssistantModel: (assistantModel) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ai_assistant_model', assistantModel);
      } catch {}
    }
    set({ assistantModel });
  },
  setAssistantHistoryLimit: (assistantHistoryLimit) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('ai_assistant_history_limit', String(assistantHistoryLimit));
      } catch {}
    }
    set({ assistantHistoryLimit });
  },

  createAssistantSession: () => set((state) => {
    const newId = `asst-session-${Date.now()}`;
    const newSession: AssistantSession = {
      id: newId,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    const updatedSessions = [newSession, ...state.assistantSessions];
    try {
      localStorage.setItem('ai_assistant_sessions', JSON.stringify(updatedSessions));
      localStorage.setItem('ai_assistant_current_session_id', newId);
    } catch {}
    return {
      assistantSessions: updatedSessions,
      currentAssistantSessionId: newId,
      assistantAttachments: []
    };
  }),

  switchAssistantSession: (id) => {
    try {
      localStorage.setItem('ai_assistant_current_session_id', id);
    } catch {}
    set({ currentAssistantSessionId: id, assistantAttachments: [] });
  },

  deleteAssistantSession: (id) => set((state) => {
    const filtered = state.assistantSessions.filter(s => s.id !== id);
    const nextSession = filtered[0] || {
      id: `asst-session-${Date.now()}`,
      title: '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    const finalSessions = filtered.length > 0 ? filtered : [nextSession];
    try {
      localStorage.setItem('ai_assistant_sessions', JSON.stringify(finalSessions));
      localStorage.setItem('ai_assistant_current_session_id', nextSession.id);
    } catch {}
    return {
      assistantSessions: finalSessions,
      currentAssistantSessionId: nextSession.id
    };
  }),

  renameAssistantSession: (id, title) => set((state) => {
    const updated = state.assistantSessions.map(s => 
      s.id === id ? { ...s, title: title.trim() || '未命名对话', updatedAt: Date.now() } : s
    );
    try {
      localStorage.setItem('ai_assistant_sessions', JSON.stringify(updated));
    } catch {}
    return { assistantSessions: updated };
  }),

  addAssistantMessage: (sessionId, message) => set((state) => {
    const updated = state.assistantSessions.map(s => {
      if (s.id === sessionId) {
        const msgs = [...s.messages, message];
        let title = s.title;
        // 如果是第一条用户消息且标题为新对话，自动提炼标题
        if (title === '新对话' && message.role === 'user' && message.content) {
          title = message.content.slice(0, 16);
        }
        return {
          ...s,
          title,
          updatedAt: Date.now(),
          messages: msgs
        };
      }
      return s;
    });
    try {
      localStorage.setItem('ai_assistant_sessions', JSON.stringify(updated));
    } catch {}
    return { assistantSessions: updated };
  }),

  addAssistantAttachment: (att) => set((state) => {
    // 🛡️ 防重复添加完全相同的媒体附件 (通过 url 校验)
    if (att.url && state.assistantAttachments.some(a => a.url === att.url)) {
      return state;
    }
    return { assistantAttachments: [...state.assistantAttachments, att] };
  }),

  removeAssistantAttachment: (index) => set((state) => ({
    assistantAttachments: state.assistantAttachments.filter((_, i) => i !== index)
  })),

  clearAssistantAttachments: () => set({ assistantAttachments: [] })
  };
});
