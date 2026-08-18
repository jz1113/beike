'use client';
import { useState, useRef, useEffect } from 'react';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import { IMAGE_GEN_MODELS, cleanPromptText } from '@/lib/drawing';
import { 
  VIDEO_GEN_MODELS, 
  VIDEO_ASPECT_RATIOS, 
  VIDEO_REF_MODES, 
  VIDEO_RESOLUTIONS, 
  VIDEO_DURATIONS,
  VideoGenModel 
} from '@/lib/video';
import { getModelIcon } from '@/components/common/ModelIcons';
import { 
  Plus, 
  X, 
  ArrowUp, 
  Sparkles, 
  Layers, 
  ChevronDown, 
  Loader2, 
  Check, 
  Link as LinkIcon,
  AtSign,
  Image as ImageIcon,
  ImagePlus,
  Film,
  Video,
  Clock,
  SlidersHorizontal,
  Shuffle,
  ArrowLeftRight,
  Clapperboard,
  Tv,
  Maximize,
  Sparkle
} from 'lucide-react';

import { RichPromptInput, RichPromptInputRef } from './RichPromptInput';

interface Props {
  onStartGenerate?: (task: GenerationTask) => void;
  onOpenProductVault?: () => void;
  dropdownPlacement?: 'up' | 'down' | 'auto';
}

// 图片比例选项列表
const IMAGE_RATIO_ITEMS = [
  { id: 'smart', label: '智能', ratio: 'auto', w: 2048, h: 2048, iconType: 'smart' },
  { id: '21:9', label: '21:9', ratio: '21:9', w: 3440, h: 1440, iconType: 'ultrawide' },
  { id: '16:9', label: '16:9', ratio: '16:9', w: 2560, h: 1440, iconType: 'wide169' },
  { id: '3:2', label: '3:2', ratio: '3:2', w: 2400, h: 1600, iconType: 'wide32' },
  { id: '4:3', label: '4:3', ratio: '4:3', w: 2348, h: 1760, iconType: 'wide43' },
  { id: '1:1', label: '1:1', ratio: '1:1', w: 2048, h: 2048, iconType: 'square' },
  { id: '3:4', label: '3:4', ratio: '3:4', w: 1760, h: 2348, iconType: 'tall34' },
  { id: '2:3', label: '2:3', ratio: '2:3', w: 1600, h: 2400, iconType: 'tall23' },
  { id: '9:16', label: '9:16', ratio: '9:16', w: 1440, h: 2560, iconType: 'tall916' }
];

// 智能提取厂商真实品牌名称
export function getModelProviderName(modelId: string = '', modelName: string = '', rawProvider?: string): string {
  if (rawProvider && rawProvider !== 'Gateway' && rawProvider !== '官方直连' && rawProvider.trim() !== '') {
    return rawProvider;
  }
  const low = `${modelId} ${modelName}`.toLowerCase();
  if (low.includes('gpt') || low.includes('dall-e') || low.includes('openai') || low.includes('sora')) return 'OpenAI';
  if (low.includes('grok') || low.includes('xai')) return 'xAI';
  if (low.includes('seedream') || low.includes('seedance') || low.includes('doubao') || low.includes('bytedance') || low.includes('即梦') || low.includes('火山')) return '字节即梦';
  if (low.includes('midjourney') || low.includes('mj')) return 'Midjourney';
  if (low.includes('gemini') || low.includes('imagen') || low.includes('google') || low.includes('veo')) return 'Google';
  if (low.includes('flux') || low.includes('black forest')) return 'BFL FLUX';
  if (low.includes('claude') || low.includes('anthropic')) return 'Anthropic';
  if (low.includes('kling') || low.includes('可灵') || low.includes('kuaishou')) return '快手可灵';
  if (low.includes('minimax') || low.includes('hailuo') || low.includes('海螺')) return 'MiniMax';
  if (low.includes('wanx') || low.includes('qwen') || low.includes('tongyi') || low.includes('通义')) return '阿里通义';
  if (low.includes('deepseek')) return 'DeepSeek';
  if (low.includes('zhipu') || low.includes('cogview') || low.includes('glm')) return '智谱AI';
  if (low.includes('sd') || low.includes('stable diffusion') || low.includes('stability')) return 'Stability AI';
  if (low.includes('recraft')) return 'Recraft AI';
  if (low.includes('vidu')) return '生数科技';
  if (low.includes('runway') || low.includes('gen-3') || low.includes('gen3')) return 'Runway';
  if (low.includes('kimi') || low.includes('moonshot')) return '月之暗面';
  return '官方直连';
}

// 智能获取模型的官方高保真能力描述
export function getModelAccurateDescription(modelId: string = '', modelName: string = '', rawDesc?: string): string {
  if (rawDesc && !rawDesc.includes('Gateway') && rawDesc.trim() !== '') {
    return rawDesc;
  }
  const low = `${modelId} ${modelName}`.toLowerCase();
  if (low.includes('gpt-image-2') || low.includes('gpt-image')) {
    return 'OpenAI 商业摄影级 4K 高保真光影构图与电商质感渲染';
  }
  if (low.includes('grok')) {
    return 'xAI 拟真手机镜头写实生活感、自然漫反射与高逼真买家秀';
  }
  if (low.includes('seedream-5') || (low.includes('seedream') && low.includes('5'))) {
    return '火山引擎官方电商旗舰模型，超清质感与商品主体精准保真';
  }
  if (low.includes('seedream-3') || low.includes('seedream')) {
    return '字节即梦低延迟极速电商主图与社媒种草图生成';
  }
  if (low.includes('midjourney') || low.includes('mj')) {
    return 'Midjourney 顶级艺术美学、高质感摄影构图与高级设计视觉';
  }
  if (low.includes('gemini-3.1') || low.includes('gemini-3') || low.includes('imagen')) {
    return 'Google 旗舰级多模态图文精准对齐与商业 4K 高保真生成';
  }
  if (low.includes('flux')) {
    return 'Black Forest Labs 顶级真实光影、细腻文字排版与高质感细节';
  }
  if (low.includes('sd3') || low.includes('sdxl') || low.includes('stable')) {
    return 'Stability AI 极速高写实摄影质感与自由可控构图';
  }
  if (low.includes('recraft')) {
    return '专业级高精度设计与电商矢量/质感商品图生成';
  }
  if (low.includes('kling') || low.includes('可灵')) {
    return '快手可灵电影级动态构图与超写实人物光影渲染';
  }
  if (low.includes('seedance-2.5') || (low.includes('seedance') && low.includes('2.5'))) {
    return '即梦最新 2.5 旗舰视频大模型，支持 50 图全能参考与高表现力运动控制';
  }
  if (low.includes('seedance-2.0') || low.includes('seedance')) {
    return '字节跳动即梦 2.0 旗舰视频生成，超快运镜与流畅物理动力学';
  }
  if (low.includes('veo')) {
    return 'Google 电影级超高清物理世界模拟与长镜头推拉摇移';
  }
  if (low.includes('sora')) {
    return 'OpenAI 突破级高连贯世界模型与复杂影视级运镜';
  }
  if (low.includes('wanx') || low.includes('万相')) {
    return '阿里通义万相 2.1 影视级视频生成，复杂运动连贯与逼真质感';
  }
  if (low.includes('hailuo') || low.includes('minimax') || low.includes('海螺')) {
    return 'MiniMax 海螺影视级超逼真动作生成与物理交互';
  }
  if (low.includes('vidu')) {
    return '生数科技 Vidu 2.0 超清多视角动态生成与角色一致性';
  }
  return '旗舰商业高保真 AI 生成引擎，支持多模态精准对齐与超清渲染';
}

// 智能获取模型特色微标
export function getModelBadgeName(modelId: string = '', modelName: string = '', rawBadge?: string): string {
  if (rawBadge && rawBadge !== 'Gateway' && rawBadge.trim() !== '') {
    return rawBadge;
  }
  const low = `${modelId} ${modelName}`.toLowerCase();
  if (low.includes('gpt-image-2')) return '4K超清';
  if (low.includes('grok')) return '反AI实拍';
  if (low.includes('seedream-5')) return '电商爆款';
  if (low.includes('seedream')) return '极速电商';
  if (low.includes('midjourney')) return '艺术质感';
  if (low.includes('gemini')) return '极速4K';
  if (low.includes('flux')) return '极致光影';
  if (low.includes('kling')) return '电影级';
  if (low.includes('seedance-2.5')) return '最强视频';
  if (low.includes('seedance-2.0')) return '性价比';
  if (low.includes('veo')) return '电影级4K';
  if (low.includes('sora')) return '世界模型';
  return '官方推荐';
}

// 渲染迷你比例轮廓框图标
export function renderRatioMiniIcon(iconType?: string, className = "w-3.5 h-3.5 opacity-80 shrink-0") {
  if (iconType === 'smart') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
        <rect x="8" y="8" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5" />
      </svg>
    );
  }
  if (iconType === 'ultrawide') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="1" y="8" width="22" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'wide169') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'wide32') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'wide43') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'square') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'tall34') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'tall23') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (iconType === 'tall916') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export interface SubjectItem {
  id: string;
  name: string;
  url: string;
}

export default function PromptActionBar({ 
  onStartGenerate, 
  onOpenProductVault, 
  dropdownPlacement = 'auto' 
}: Props) {
  const {
    hubGenMode = 'image',
    setHubGenMode,
    quickPrompt,
    setQuickPrompt,
    quickRefImages = [],
    setQuickRefImages,
    addQuickRefImage,
    removeQuickRefImage,
    quickModel,
    setQuickModel,
    quickAspectId,
    setQuickAspectId,
    quickQuality,
    setQuickQuality,
    quickCount,
    setQuickCount,
    quickVideoModel = 'seedance-2.0-mini',
    setQuickVideoModel,
    quickVideoDuration = 5,
    setQuickVideoDuration,
    quickVideoResolution = '720P',
    setQuickVideoResolution,
    quickVideoAspectId = '16:9',
    setQuickVideoAspectId,
    quickVideoRefMode = 'omni',
    setQuickVideoRefMode,
    quickVideoFirstFrame,
    quickVideoLastFrame,
    setQuickVideoFirstFrame,
    setQuickVideoLastFrame,
    swapVideoFirstLastFrames,
    quickVideoMultiFrames = [],
    setQuickVideoMultiFrames,
    addQuickVideoMultiFrame,
    removeQuickVideoMultiFrame,
    quickVideoCount = 1,
    setQuickVideoCount,
    addHubGeneration,
    addBatchHubGenerations,
    updateHubGeneration,
    currentView,
    setCurrentView,
    sessions,
    currentSessionId,
    product,
    images = []
  } = useAppStore();

  // 根据当前视图或参数智能判定弹窗朝上展开还是朝下展开
  const isUp = dropdownPlacement === 'up' || (dropdownPlacement === 'auto' && currentView === 'generate');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showAspectDropdown, setShowAspectDropdown] = useState(false);
  const [showVideoRefModeDropdown, setShowVideoRefModeDropdown] = useState(false);
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isExpandedRefImages, setIsExpandedRefImages] = useState(false);

  // @ 主体选择相关状态 (支持同时@多个主体，如 @insp_1, @insp_2)
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [activeSubjects, setActiveSubjects] = useState<SubjectItem[]>([]);
  const activeSubject = activeSubjects[0] || null;
  const [customSubjects, setCustomSubjects] = useState<SubjectItem[]>([]);
  const [refImageNames, setRefImageNames] = useState<Record<string, string>>({});

  const hoverRefImagesTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterRefImages = () => {
    if (hoverRefImagesTimeout.current) {
      clearTimeout(hoverRefImagesTimeout.current);
      hoverRefImagesTimeout.current = null;
    }
    if (quickRefImages.length > 0) {
      setIsExpandedRefImages(true);
    }
  };

  const handleMouseLeaveRefImages = () => {
    if (hoverRefImagesTimeout.current) {
      clearTimeout(hoverRefImagesTimeout.current);
    }
    hoverRefImagesTimeout.current = setTimeout(() => {
      setIsExpandedRefImages(false);
    }, 350);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstFrameInputRef = useRef<HTMLInputElement>(null);
  const lastFrameInputRef = useRef<HTMLInputElement>(null);

  const handleUploadFirstFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setQuickVideoFirstFrame(event.target.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadLastFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setQuickVideoLastFrame(event.target.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const multiFrameInputRef = useRef<HTMLInputElement>(null);

  const handleUploadMultiFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          addQuickVideoMultiFrame(event.target.result);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };
  const createSubjectInputRef = useRef<HTMLInputElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const aspectDropdownRef = useRef<HTMLDivElement>(null);
  const videoRefModeDropdownRef = useRef<HTMLDivElement>(null);
  const durationDropdownRef = useRef<HTMLDivElement>(null);
  const atMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const richInputRef = useRef<RichPromptInputRef>(null);
  const refImagesContainerRef = useRef<HTMLDivElement>(null);

  // 聚合所有可用主体（主体名称直接使用图片原文件名或真实名称）
  const allSubjects: SubjectItem[] = [];

  // 1. 自建主体
  customSubjects.forEach(s => allSubjects.push(s));

  // 2. 左侧所有导入垫图
  if (quickRefImages && quickRefImages.length > 0) {
    quickRefImages.forEach((url, idx) => {
      const origName = refImageNames[url] || `图片${idx + 1}`;
      allSubjects.push({
        id: `ref-${idx}`,
        name: origName,
        url
      });
    });
  } else if (images && images.length > 0) {
    // 3. 如果已有导入的商品图库
    images.forEach((img, idx) => {
      const typeName = img.type === 'main' ? '主图' : (img.type === 'detail' ? '详情图' : 'SKU图');
      const origName = refImageNames[img.url] || `${typeName}_${idx + 1}`;
      allSubjects.push({
        id: `prod-${idx}`,
        name: origName,
        url: img.url
      });
    });
  }

  // 点击外部关闭弹窗
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
      if (aspectDropdownRef.current && !aspectDropdownRef.current.contains(e.target as Node)) {
        setShowAspectDropdown(false);
      }
      if (videoRefModeDropdownRef.current && !videoRefModeDropdownRef.current.contains(e.target as Node)) {
        setShowVideoRefModeDropdown(false);
      }
      if (durationDropdownRef.current && !durationDropdownRef.current.contains(e.target as Node)) {
        setShowDurationDropdown(false);
      }
      if (atMenuRef.current && !atMenuRef.current.contains(e.target as Node)) {
        setShowAtMenu(false);
      }
      if (refImagesContainerRef.current && !refImagesContainerRef.current.contains(e.target as Node)) {
        setIsExpandedRefImages(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 动态加载自定义/网关已接入生图大模型与视频大模型
  const [availableImageModels, setAvailableImageModels] = useState<any[]>(IMAGE_GEN_MODELS);
  const [availableVideoModels, setAvailableVideoModels] = useState<any[]>(VIDEO_GEN_MODELS);

  useEffect(() => {
    const loadCustomModels = () => {
      const savedCustom = localStorage.getItem('custom_models');
      if (savedCustom) {
        try {
          const parsed = JSON.parse(savedCustom);
          if (Array.isArray(parsed)) {
            const customImage = parsed.filter((m: any) => m.isImage).map((m: any) => ({
              id: m.id,
              name: m.name || m.id,
              provider: getModelProviderName(m.id, m.name || m.id, m.provider),
              badge: getModelBadgeName(m.id, m.name || m.id, m.badge),
              description: getModelAccurateDescription(m.id, m.name || m.id, m.desc || m.description),
              modelId: m.id,
              isPrimary: false
            }));
            if (customImage.length > 0) {
              setAvailableImageModels(customImage);
              const savedImg = localStorage.getItem('ai_image_gen_model');
              if (savedImg && customImage.some(m => m.id === savedImg)) {
                setQuickModel(savedImg);
              } else if (!customImage.some(m => m.id === quickModel)) {
                setQuickModel(customImage[0].id);
              }
            }

            const customVideo = parsed.filter((m: any) => m.isVideo).map((m: any) => ({
              id: m.id,
              name: m.name || m.id,
              shortName: m.shortName || m.id.split(' ')[0] || m.name,
              provider: getModelProviderName(m.id, m.name || m.id, m.provider),
              badge: getModelBadgeName(m.id, m.name || m.id, m.badge),
              description: getModelAccurateDescription(m.id, m.name || m.id, m.desc || m.description),
              isPrimary: false
            }));
            if (customVideo.length > 0) {
              setAvailableVideoModels(customVideo);
              const savedVid = localStorage.getItem('ai_video_gen_model');
              if (savedVid && customVideo.some(m => m.id === savedVid)) {
                setQuickVideoModel(savedVid);
              } else if (!customVideo.some(m => m.id === quickVideoModel)) {
                setQuickVideoModel(customVideo[0].id);
              }
            }
          }
        } catch (e) {}
      }
    };

    loadCustomModels();
    window.addEventListener('models_updated', loadCustomModels);
    return () => window.removeEventListener('models_updated', loadCustomModels);
  }, []);

  // 当前激活的图片模型与比例
  const activeImageModelObj = availableImageModels.find(m => m.id === quickModel) || availableImageModels[0] || { name: quickModel, provider: 'Gateway' };
  const activeImageRatioObj = IMAGE_RATIO_ITEMS.find(r => r.id === quickAspectId) || IMAGE_RATIO_ITEMS[0];

  // 当前激活的视频模型、参考模式与比例
  const activeVideoModelObj = availableVideoModels.find(m => m.id === quickVideoModel) || availableVideoModels[0] || VIDEO_GEN_MODELS[0];
  const activeVideoRefModeObj = VIDEO_REF_MODES.find(m => m.id === quickVideoRefMode) || VIDEO_REF_MODES[0];
  const activeVideoRatioObj = VIDEO_ASPECT_RATIOS.find(r => r.id === quickVideoAspectId) || VIDEO_ASPECT_RATIOS[1];

  // 计算图片尺寸数值
  const getCalculatedImageSize = () => {
    let multiplier = 1;
    if (quickQuality === 'low') multiplier = 0.75;
    if (quickQuality === 'medium') multiplier = 1.0;
    if (quickQuality === 'high') multiplier = 1.5;
    const w = Math.round(activeImageRatioObj.w * multiplier);
    const h = Math.round(activeImageRatioObj.h * multiplier);
    return { w, h, sizeStr: `${w}x${h}` };
  };

  const { w: currentW, h: currentH, sizeStr } = getCalculatedImageSize();

  // 上传文件处理 (参考图/参考视频素材，保留原始文件名)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      const origName = file.name.replace(/\.[^/.]+$/, '').trim() || file.name;
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === 'string') {
          const url = event.target.result;
          setRefImageNames(prev => ({ ...prev, [url]: origName }));
          addQuickRefImage(url);
          setIsExpandedRefImages(true);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // 🌟 创建新主体 (主体名称直接使用图片原文件名)
  const handleCreateSubject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const origName = file.name.replace(/\.[^/.]+$/, '').trim() || file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        const url = event.target.result;
        const newSub: SubjectItem = {
          id: `custom-${Date.now()}`,
          name: origName,
          url
        };
        setRefImageNames(prev => ({ ...prev, [url]: origName }));
        setCustomSubjects(prev => [newSub, ...prev]);
        handleSelectSubject(newSub);
        setIsExpandedRefImages(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 🌟 选中某个主体并在光标所在精确位置插入 @主体名 (即梦同款光标处内联嵌入，实时渲染微缩图)
  const handleSelectSubject = (subject: SubjectItem) => {
    setActiveSubjects(prev => {
      if (prev.some(s => s.id === subject.id || s.url === subject.url)) {
        return prev;
      }
      return [...prev, subject];
    });

    if (!quickRefImages.includes(subject.url)) {
      addQuickRefImage(subject.url);
      setIsExpandedRefImages(true);
    }

    if (richInputRef.current) {
      richInputRef.current.insertMention(subject);
    } else {
      const insertTag = `@${subject.name} `;
      const curr = quickPrompt;
      const updated = curr.endsWith('@') ? curr.slice(0, -1) + insertTag : (curr ? curr + ' ' + insertTag : insertTag);
      setQuickPrompt(updated);
    }
    setShowAtMenu(false);
  };

  // 移除某个指定主体
  const handleRemoveSubject = (id: string) => {
    setActiveSubjects(prev => prev.filter(s => s.id !== id));
  };

  // 移除所有选中的主体
  const handleRemoveActiveSubject = () => {
    setActiveSubjects([]);
  };

  // 监听输入框变动 (支持 @ 呼出主体菜单并实时记录光标位置)
  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const pos = e.target.selectionStart;
    setQuickPrompt(val);
    setCursorPosition(pos);
    if (val.slice(0, pos).endsWith('@')) {
      setShowAtMenu(true);
    }
  };

  // 🌟 输入框高度随输入内容自动自适应撑开 (最高可达 160px，长短文本自适应)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, 24), 160)}px`;
    }
  }, [quickPrompt]);

  // 拖拽上传支持
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
          const origName = file.name.replace(/\.[^/.]+$/, '').trim() || file.name;
          const reader = new FileReader();
          reader.onload = (event) => {
            if (typeof event.target?.result === 'string') {
              const url = event.target.result;
              setRefImageNames(prev => ({ ...prev, [url]: origName }));
              addQuickRefImage(url);
              setIsExpandedRefImages(true);
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  // 剪贴板粘贴图片处理
  const handlePaste = (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    let hasImage = false;

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            hasImage = true;
            const reader = new FileReader();
            reader.onload = (event) => {
              if (typeof event.target?.result === 'string') {
                addQuickRefImage(event.target.result);
                setIsExpandedRefImages(true);
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    }

    if (hasImage && !clipboardData.getData('text')) {
      e.preventDefault();
    }
  };

  // 发送任务 (支持图片生图与视频生成，确保多主体与内联引用 100% 映射与调用)
  const handleSendPrompt = async () => {
    // 1. 扫描 prompt 中内联引用的所有 @主体名 或 {{Mixed x}} 或 @图片x
    const referencedImages: string[] = [];
    
    allSubjects.forEach(sub => {
      if (quickPrompt.includes(`@${sub.name}`) || activeSubjects.some(a => a.id === sub.id)) {
        if (!referencedImages.includes(sub.url)) {
          referencedImages.push(sub.url);
        }
      }
    });

    const mixedMatches = Array.from(quickPrompt.matchAll(/(?:\{\{\s*(?:Mixed|Image|图)?\s*(\d+)\s*\}\}|@(?:图片|insp_)?(\d+))/gi));
    mixedMatches.forEach(m => {
      const idx = parseInt(m[1] || m[2], 10) - 1;
      if (quickRefImages[idx] && !referencedImages.includes(quickRefImages[idx])) {
        referencedImages.push(quickRefImages[idx]);
      }
    });

    let effectiveImages: string[] = [];

    if (hubGenMode === 'video') {
      if (quickVideoRefMode === 'first_last_frame') {
        if (quickVideoFirstFrame) effectiveImages.push(quickVideoFirstFrame);
        if (quickVideoLastFrame) effectiveImages.push(quickVideoLastFrame);
      } else if (quickVideoRefMode === 'multi_frame') {
        effectiveImages = [...quickVideoMultiFrames];
      } else {
        effectiveImages = Array.from(new Set([...referencedImages, ...quickRefImages, ...activeSubjects.map(s => s.url)]));
      }
    } else {
      effectiveImages = Array.from(new Set([...referencedImages, ...quickRefImages, ...activeSubjects.map(s => s.url)]));
    }

    if (!quickPrompt.trim() && effectiveImages.length === 0) {
      if (hubGenMode === 'video' && quickVideoRefMode === 'first_last_frame') {
        alert('请输入描述你想生成的视频提示词，或上传首帧/尾帧图片');
      } else if (hubGenMode === 'video' && quickVideoRefMode === 'multi_frame') {
        alert('请添加智能多帧的镜头或输入视频生成描述');
      } else {
        alert(hubGenMode === 'video' ? '请输入描述你想生成的视频提示词或上传参考素材' : '请输入描述你想生成的图片提示词或选择图片主体');
      }
      return;
    }

    setIsSubmitting(true);
    const countToGen = hubGenMode === 'video' ? (quickVideoCount || 1) : (quickCount || 1);
    const refImg = effectiveImages[0] || undefined;

    // 自动切换到生成工作区页面
    useAppStore.getState().setCurrentView('generate');

    let finalPrompt = quickPrompt.trim();
    if (effectiveImages.length > 0) {
      // 兼容标准多模态占位符
      finalPrompt = finalPrompt
        .replace(/\{\{\s*(?:Mixed|Image|图)?\s*1\s*\}\}/gi, '@图片1')
        .replace(/\{\{\s*(?:Mixed|Image|图)?\s*2\s*\}\}/gi, '@图片2')
        .replace(/\{\{\s*(?:Mixed|Image|图)?\s*3\s*\}\}/gi, '@图片3');
    }

    const cleanedPrompt = cleanPromptText(finalPrompt);
    const batchId = `batch-${Date.now()}`;
    const batchTimestamp = Date.now();
    const tasksToCreate: GenerationTask[] = [];

    for (let i = 0; i < countToGen; i++) {
      const taskId = `hub-gen-${batchTimestamp}-${i}`;
      
      const newTask: GenerationTask = {
        id: taskId,
        batchId,
        shotNo: i + 1,
        title: quickPrompt.slice(0, 25) || (hubGenMode === 'video' ? '智能视频创作' : '快速商用生图'),
        prompt: cleanedPrompt,
        mediaType: hubGenMode, // 'image' | 'video'
        model: hubGenMode === 'video' ? quickVideoModel : quickModel,
        size: hubGenMode === 'video' ? quickVideoAspectId : sizeStr,
        quality: hubGenMode === 'video' ? quickVideoResolution : quickQuality,
        videoDuration: hubGenMode === 'video' ? quickVideoDuration : undefined,
        videoResolution: hubGenMode === 'video' ? quickVideoResolution : undefined,
        videoRefMode: hubGenMode === 'video' ? quickVideoRefMode : undefined,
        referenceImageUrl: refImg,
        referenceImages: effectiveImages.length > 0 ? effectiveImages : undefined,
        images: effectiveImages.length > 0 ? effectiveImages : undefined,
        useReferenceImage: effectiveImages.length > 0,
        status: 'IN_PROGRESS',
        progress: '15%',
        createdAt: batchTimestamp
      };

      tasksToCreate.push(newTask);
    }

    // 🌟 核心：每次从指令输入框发起全新任务，自动新建独立对话 (isNewSession = true)
    addBatchHubGenerations(tasksToCreate, cleanedPrompt.slice(0, 18) || (hubGenMode === 'video' ? '智能视频创作' : '快速商用生图'), true);

    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Backspace' && !quickPrompt && activeSubjects.length > 0) {
      setActiveSubjects(prev => prev.slice(0, -1));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
  };

  return (
    <div className="w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1400px] mx-auto select-none">
      {/* 🌟 1. 顶部主标题：贝壳云图 */}
      {currentView !== 'generate' && (
        <div className="flex items-center justify-center mb-4 sm:mb-5 select-none animate-fade-in">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">贝壳云图</h1>
        </div>
      )}

      {/* 🌟 2. 核心指令生成控制大卡片 (即梦同款纯净白底高圆角与柔和微阴影) */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-[28px] sm:rounded-[32px] bg-white border transition-all p-4 sm:p-5 ${
          isDraggingOver 
            ? 'border-sky-400 shadow-[0_12px_40px_rgba(56,189,248,0.25)] ring-2 ring-sky-400/40' 
            : 'border-slate-200/90 shadow-[0_8px_30px_rgba(0,0,0,0.03)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)]'
        }`}
      >
        {/* 隐藏的图片文件选择器 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* 隐藏的主体创建文件选择器 */}
        <input
          ref={createSubjectInputRef}
          type="file"
          accept="image/*"
          onChange={handleCreateSubject}
          className="hidden"
        />

        {/* 隐藏的视频首帧与尾帧文件选择器 */}
        <input
          ref={firstFrameInputRef}
          type="file"
          accept="image/*"
          onChange={handleUploadFirstFrame}
          className="hidden"
        />
        <input
          ref={lastFrameInputRef}
          type="file"
          accept="image/*"
          onChange={handleUploadLastFrame}
          className="hidden"
        />
        <input
          ref={multiFrameInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUploadMultiFrame}
          className="hidden"
        />

        {/* 顶部区域：左侧垫图方块 + 中间多行输入框 */}
        <div className="flex items-start gap-3.5 sm:gap-4.5">
          {/* 左侧多图垫图展示/上传方块 (支持首尾帧专属双卡片 & 悬停多图平铺) */}
          {hubGenMode === 'video' && quickVideoRefMode === 'first_last_frame' ? (
            /* 🎬 视频首尾帧专属双卡片展示区 (严格对照即梦/专业视频双帧构型) */
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 pt-0.5">
              {/* 首帧卡片 (向左轻微倾斜 -rotate-[4deg]) */}
              <div className="relative group/first">
                {quickVideoFirstFrame ? (
                  <div className="relative w-15 h-19 sm:w-17 sm:h-21 rounded-2xl border border-slate-200 shadow-sm bg-white -rotate-[4deg] transition-all group-hover/first:rotate-0 group-hover/first:scale-105">
                    <div className="w-full h-full rounded-2xl overflow-hidden">
                      <img src={quickVideoFirstFrame} alt="首帧" className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white shadow-xs pointer-events-none whitespace-nowrap">
                      首帧
                    </div>
                    {/* 悬浮圆形深色删除按钮 (严格对标截图) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickVideoFirstFrame(null);
                      }}
                      className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/first:opacity-100"
                      title="移除首帧"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => firstFrameInputRef.current?.click()}
                    className="w-15 h-19 sm:w-17 sm:h-21 rounded-2xl bg-[#F8F9FA] hover:bg-slate-100 border border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs -rotate-[4deg] hover:rotate-0 group/card"
                    title="上传视频第 1 帧起始图 (首帧)"
                  >
                    <Plus className="w-5 h-5 text-slate-400 group-hover/card:scale-110 transition-transform stroke-[1.8]" />
                    <span className="text-[11px] font-bold text-slate-500">首帧</span>
                  </button>
                )}
              </div>

              {/* 中间首尾帧流转/交换按钮 (⇄) */}
              <button
                type="button"
                onClick={swapVideoFirstLastFrames}
                className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all cursor-pointer self-center"
                title="交换首尾帧顺序"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>

              {/* 尾帧卡片 (向右轻微倾斜 rotate-[4deg]) */}
              <div className="relative group/last">
                {quickVideoLastFrame ? (
                  <div className="relative w-15 h-19 sm:w-17 sm:h-21 rounded-2xl border border-slate-200 shadow-sm bg-white rotate-[4deg] transition-all group-hover/last:rotate-0 group-hover/last:scale-105">
                    <div className="w-full h-full rounded-2xl overflow-hidden">
                      <img src={quickVideoLastFrame} alt="尾帧" className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white shadow-xs pointer-events-none whitespace-nowrap">
                      尾帧
                    </div>
                    {/* 悬浮圆形深色删除按钮 (严格对标截图) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQuickVideoLastFrame(null);
                      }}
                      className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/last:opacity-100"
                      title="移除尾帧"
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => lastFrameInputRef.current?.click()}
                    className="w-15 h-19 sm:w-17 sm:h-21 rounded-2xl bg-[#F8F9FA] hover:bg-slate-100 border border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs rotate-[4deg] hover:rotate-0 group/card"
                    title="上传视频结束图 (尾帧)"
                  >
                    <Plus className="w-5 h-5 text-slate-400 group-hover/card:scale-110 transition-transform stroke-[1.8]" />
                    <span className="text-[11px] font-bold text-slate-500">尾帧</span>
                  </button>
                )}
              </div>
            </div>
          ) : hubGenMode === 'video' && quickVideoRefMode === 'multi_frame' ? (
            /* 🎞️ 智能多帧专属多镜头卡片展示区 (严格对照截图) */
            <div className="flex items-center gap-2 flex-shrink-0 pt-0.5 max-w-[340px] overflow-x-auto py-1 scrollbar-none">
              {quickVideoMultiFrames.map((frame, idx) => (
                <div key={idx} className="relative group/mframe flex-shrink-0">
                  <div className="relative w-15 h-19 sm:w-17 sm:h-21 rounded-2xl border border-slate-200 shadow-sm bg-white transition-all group-hover/mframe:scale-105">
                    <div className="w-full h-full rounded-2xl overflow-hidden">
                      <img src={frame} alt={`第${idx + 1}帧`} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white shadow-xs pointer-events-none whitespace-nowrap">
                      第{idx + 1}帧
                    </div>
                    {/* 悬浮圆形深色删除按钮 (严格对标截图) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeQuickVideoMultiFrame(idx);
                      }}
                      className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/mframe:opacity-100"
                      title={`删除第${idx + 1}帧`}
                    >
                      <X className="w-3.5 h-3.5 stroke-[2.2]" />
                    </button>
                  </div>
                </div>
              ))}

              {/* 添加下一帧卡片 (如果还未达到上限) */}
              {quickVideoMultiFrames.length < 10 && (
                <button
                  type="button"
                  onClick={() => multiFrameInputRef.current?.click()}
                  className={`w-15 h-19 sm:w-17 sm:h-21 rounded-2xl bg-[#F8F9FA] hover:bg-slate-100 border border-slate-200/90 hover:border-slate-300 text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs ${
                    quickVideoMultiFrames.length === 0 ? '-rotate-[4deg] hover:rotate-0' : ''
                  } group/card flex-shrink-0`}
                  title={`添加第 ${quickVideoMultiFrames.length + 1} 帧镜头`}
                >
                  <Plus className="w-5 h-5 text-slate-400 group-hover/card:scale-110 transition-transform stroke-[1.8]" />
                  <span className="text-[11px] font-bold text-slate-500">第{quickVideoMultiFrames.length + 1}帧</span>
                </button>
              )}
            </div>
          ) : (
          <div 
            ref={refImagesContainerRef}
            onMouseEnter={handleMouseEnterRefImages}
            onMouseLeave={handleMouseLeaveRefImages}
            className="flex-shrink-0 relative select-none pt-0.5"
          >
            {quickRefImages.length === 0 ? (
              /* 0 张图：极简微倾拍立得卡片 (严格对标即梦官方设计) */
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-14 h-18 sm:w-16 sm:h-20 rounded-2xl bg-[#F4F5F8] hover:bg-[#EBEDF2] -rotate-[4deg] hover:rotate-0 hover:scale-105 border border-slate-200/80 shadow-2xs text-slate-400 hover:text-slate-700 flex flex-col items-center justify-center gap-1 transition-all cursor-pointer group/empty flex-shrink-0"
                title={hubGenMode === 'video' ? '上传参考素材/首帧/动作图或拖入文件' : '上传参考图或直接拖入图片'}
              >
                <Plus className="w-5 h-5 text-slate-400 group-hover/empty:scale-110 transition-transform stroke-[2]" />
                {hubGenMode === 'video' && (
                  <span className="text-[10px] text-slate-400 font-medium leading-none">参考内容</span>
                )}
              </button>
            ) : isExpandedRefImages ? (
              /* 🎨 展开态：拍立得照片墙平铺展开 (严格对标图 3) */
              <div className="flex items-center gap-3 sm:gap-4 relative select-none flex-shrink-0 animate-fade-in py-1">
                {quickRefImages.map((img, idx) => {
                  // 渐变有机自然微倾斜角度 (-4deg, -1deg, +3deg, +5deg...)
                  const rotations = ['-rotate-[4deg]', '-rotate-[1deg]', 'rotate-[3deg]', 'rotate-[5deg]', 'rotate-[2deg]'];
                  const rotClass = rotations[idx % rotations.length];

                  return (
                    <div 
                      key={idx} 
                      className={`relative w-16 h-20 sm:w-18 sm:h-22 bg-white p-1 rounded-sm shadow-md border border-slate-200/90 transition-all hover:scale-105 hover:rotate-0 hover:z-30 hover:shadow-xl ${rotClass} flex-shrink-0 group/card`}
                    >
                      <img src={img} alt={`参考素材-${idx + 1}`} className="w-full h-full object-cover rounded-xs" />

                      {/* 顶部悬浮深色圆形删除按钮 × (严格对标截图 3) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeQuickRefImage(idx);
                          if (quickRefImages.length <= 1) {
                            setIsExpandedRefImages(false);
                          }
                        }}
                        className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-[#18191C] hover:bg-black text-white shadow-md border border-white/20 flex items-center justify-center transition-all cursor-pointer z-30 hover:scale-110 active:scale-95 opacity-0 group-hover/card:opacity-100"
                        title="删除此参考素材"
                      >
                        <X className="w-3.5 h-3.5 stroke-[2.2]" />
                      </button>
                    </div>
                  );
                })}

                {/* 末尾【+ 参考内容】倾斜卡片 (严格对标截图 3) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-16 h-20 sm:w-18 sm:h-22 bg-[#F9FAFB] hover:bg-slate-100 p-1 rounded-sm shadow-md border border-slate-200/90 transition-all hover:scale-105 hover:rotate-0 hover:shadow-xl rotate-[4deg] flex-shrink-0 flex flex-col items-center justify-center gap-1 cursor-pointer text-slate-500 hover:text-slate-800 group/add"
                  title="添加更多参考素材"
                >
                  <Plus className="w-5 h-5 text-slate-500 group-hover/add:scale-110 transition-transform stroke-[1.8]" />
                  <span className="text-[10px] sm:text-[11px] font-medium text-slate-600 group-hover/add:text-slate-900 leading-tight">
                    参考内容
                  </span>
                </button>

                {/* 收起折叠按钮 */}
                {quickRefImages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setIsExpandedRefImages(false)}
                    className="self-center ml-0.5 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="收起为折叠卡片"
                  >
                    收起
                  </button>
                )}
              </div>
            ) : (
              /* 🎴 折叠态：拍立得照片叠层卡片堆 (严格对标图 1) */
              <div 
                onClick={() => setIsExpandedRefImages(true)}
                className="relative w-16 h-20 sm:w-18 sm:h-22 cursor-pointer flex-shrink-0 group/stack select-none transition-all hover:scale-105"
                title="点击展开查看全部参考素材"
              >
                {/* 叠底层 2 (微向右倾斜 rotate-[6deg]) */}
                <div className="absolute inset-0 bg-white p-1 rounded-sm shadow-md border border-slate-200/90 rotate-[6deg] scale-95 transition-transform group-hover/stack:rotate-[8deg]">
                  {quickRefImages[1] ? (
                    <img src={quickRefImages[1]} alt="" className="w-full h-full object-cover rounded-xs" />
                  ) : (
                    <div className="w-full h-full bg-slate-100 rounded-xs" />
                  )}
                </div>

                {/* 叠底层 3 (若有3张以上素材，轻微微倾 rotate-[1deg]) */}
                {quickRefImages.length > 2 && (
                  <div className="absolute inset-0 bg-white p-1 rounded-sm shadow-md border border-slate-200/90 rotate-[1deg] scale-98 transition-transform group-hover/stack:rotate-[3deg]">
                    <img src={quickRefImages[2]} alt="" className="w-full h-full object-cover rounded-xs" />
                  </div>
                )}

                {/* 置顶顶层卡片 (微向左倾斜 -rotate-[6deg]，严格对标截图 1) */}
                <div className="relative w-full h-full bg-white p-1 rounded-sm shadow-lg border border-slate-200/90 -rotate-[6deg] transition-transform group-hover/stack:-rotate-[8deg] z-10">
                  <img src={quickRefImages[0]} alt="参考素材" className="w-full h-full object-cover rounded-xs" />
                  
                  {/* 右下角悬浮白色圆形 + 展开/添加按钮 (严格对标截图 1) */}
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpandedRefImages(true);
                    }}
                    className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-white text-slate-800 shadow-md border border-slate-200/90 flex items-center justify-center font-bold hover:scale-110 transition-transform cursor-pointer z-20"
                    title="展开参考素材"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* 中间输入框区域 (即梦同款纯净内联版式，@主体直接融入光标文本流) */}
          <div className="flex-1 min-w-0 py-0.5 relative flex items-center min-h-[48px]">
            <RichPromptInput
              ref={richInputRef}
              value={quickPrompt}
              onChange={setQuickPrompt}
              onKeyDown={handleKeyDown}
              placeholder={
                hubGenMode === 'video'
                  ? (quickVideoRefMode === 'multi_frame'
                      ? "请添加智能多帧的镜头"
                      : quickVideoRefMode === 'first_last_frame'
                        ? "输入文字，描述你想创作的画面内容、运动过程..."
                        : "上传最多50个参考素材、输入文字或 @ 参考内容，自由组合图、文、音、视频多元素，定义精彩互动。例如：@图片1 模仿 @视频1 的动作，音色参考 @音频1，")
                  : "上传参考图、输入文字或 @ 主体，描述你想生成的图片。"
              }
              allSubjects={allSubjects}
              quickRefImages={quickRefImages}
              onTriggerAtMenu={(pos) => {
                setCursorPosition(pos);
                setShowAtMenu(true);
              }}
              onCleanPrompt={() => setQuickPrompt(cleanPromptText(quickPrompt))}
              showCleanButton={quickPrompt.includes('{{') || quickPrompt.includes('**') || quickPrompt.includes('画面描述') || quickPrompt.includes('Prompt:')}
            />

            {/* @ 呼出的主体选择菜单 (严格对标图 1) */}
            {showAtMenu && (
              <div 
                ref={atMenuRef}
                className={`absolute left-0 ${isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-1.5 origin-top'} w-64 rounded-2xl bg-white border border-slate-200/90 shadow-2xl p-2 z-50 animate-fade-in space-y-1.5 text-left`}
              >
                <div className="px-2 py-1 text-[11px] font-bold text-slate-400">
                  可能@的内容
                </div>

                {/* 创建主体按钮 */}
                <button
                  type="button"
                  onClick={() => createSubjectInputRef.current?.click()}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-2.5 transition-all cursor-pointer border border-slate-200/60"
                >
                  <Plus className="w-4 h-4 text-slate-700 stroke-[2.2]" />
                  <span>创建主体</span>
                </button>

                {/* 已有主体与参考素材列表 */}
                <div className="max-h-48 overflow-y-auto space-y-1 pt-1">
                  {allSubjects.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-slate-400 text-center">
                      暂无图片主体，点击上方创建
                    </div>
                  ) : (
                    allSubjects.map((sub) => {
                      const isCurrent = activeSubjects.some(s => s.id === sub.id || s.url === sub.url);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => handleSelectSubject(sub)}
                          className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-slate-100 text-slate-900 font-bold border border-slate-200'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img 
                              src={sub.url} 
                              alt="" 
                              className="w-7 h-7 rounded-md object-cover flex-shrink-0 border border-slate-200 bg-white shadow-2xs" 
                            />
                            <span className="truncate text-xs font-medium">{sub.name}</span>
                          </div>
                          {isCurrent && <Check className="w-3.5 h-3.5 text-slate-700 flex-shrink-0 stroke-[2.5]" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 🌟 底部药丸工具条 (精准对照即梦/各平台专业创作条) */}
        <div className="mt-3.5 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
          {/* 左侧药丸按钮组 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 药丸 0: 模式切换药丸 (视频生成 ⌄ / 图片生成 ⌄) */}
            <div className="relative" ref={modeDropdownRef}>
              <button
                type="button"
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                className={`h-8.5 px-3 rounded-xl font-semibold flex items-center gap-1.5 text-xs transition-all cursor-pointer border ${
                  hubGenMode === 'video'
                    ? (showModeDropdown 
                        ? 'bg-cyan-50/70 border-cyan-300 text-cyan-800 shadow-2xs' 
                        : 'bg-white hover:bg-slate-50 text-cyan-600 border-slate-200/90 shadow-2xs')
                    : (showModeDropdown 
                        ? 'bg-sky-50/70 border-sky-300 text-sky-800 shadow-2xs' 
                        : 'bg-white hover:bg-slate-50 text-sky-600 border-slate-200/90 shadow-2xs')
                }`}
              >
                {hubGenMode === 'video' ? (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 stroke-cyan-600 stroke-[2] flex-shrink-0">
                      <rect x="2.5" y="4" width="13.5" height="16" rx="3.5" />
                      <path d="M16 9.5L21.5 6.5V17.5L16 14.5" strokeLinecap="round" strokeLinejoin="round" />
                      <polygon points="7.5,9.5 7.5,14.5 11.5,12" className="fill-cyan-600 stroke-none" />
                    </svg>
                    <span>视频生成</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 stroke-sky-600 stroke-[2] flex-shrink-0">
                      <rect x="3" y="3" width="18" height="18" rx="4" />
                      <circle cx="8.5" cy="8.5" r="1.5" className="fill-sky-600 stroke-none" />
                      <path d="M21 15L16 10L6 20" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>图片生成</span>
                  </>
                )}
                <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
              </button>

              {/* 模式选择下拉弹窗 (大字号、精美图标、高颜值单行菜单) */}
              {showModeDropdown && (
                <div className={`absolute left-0 ${isUp ? 'bottom-full mb-2 origin-bottom' : 'top-full mt-2 origin-top'} w-44 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-fade-in text-left space-y-1`}>
                  {/* 图片生成选项 */}
                  <button
                    type="button"
                    onClick={() => {
                      setHubGenMode('image');
                      setShowModeDropdown(false);
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                      hubGenMode === 'image'
                        ? 'bg-slate-100/90 text-slate-950 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg viewBox="0 0 24 24" fill="none" className="w-4.5 h-4.5 stroke-slate-800 stroke-[2] flex-shrink-0">
                        <rect x="3" y="3" width="18" height="18" rx="4" />
                        <circle cx="8.5" cy="8.5" r="1.5" className="fill-slate-800 stroke-none" />
                        <path d="M21 15L16 10L6 20" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[13.5px] font-medium text-slate-900">图片生成</span>
                    </div>
                    {hubGenMode === 'image' && <Check className="w-4 h-4 text-slate-950 stroke-[2.5] flex-shrink-0" />}
                  </button>

                  {/* 视频生成选项 */}
                  <button
                    type="button"
                    onClick={() => {
                      setHubGenMode('video');
                      setShowModeDropdown(false);
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between transition-all cursor-pointer ${
                      hubGenMode === 'video'
                        ? 'bg-slate-100/90 text-slate-950 font-bold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg viewBox="0 0 24 24" fill="none" className="w-4.5 h-4.5 stroke-slate-800 stroke-[2] flex-shrink-0">
                        <rect x="2.5" y="4" width="13.5" height="16" rx="3.5" />
                        <path d="M16 9.5L21.5 6.5V17.5L16 14.5" strokeLinecap="round" strokeLinejoin="round" />
                        <polygon points="7.5,9.5 7.5,14.5 11.5,12" className="fill-slate-800 stroke-none" />
                      </svg>
                      <span className="text-[13.5px] font-medium text-slate-900">视频生成</span>
                    </div>
                    {hubGenMode === 'video' && <Check className="w-4 h-4 text-slate-950 stroke-[2.5] flex-shrink-0" />}
                  </button>
                </div>
              )}
            </div>

            {/* 药丸 1: 模型切换下拉 (视频模式切换视频模型；图片模式切换图片模型) */}
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className={`h-8.5 px-3 rounded-xl font-semibold flex items-center gap-1.5 border transition-all cursor-pointer text-xs ${
                  showModelDropdown 
                    ? 'bg-slate-50 text-slate-950 border-slate-300 shadow-2xs' 
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-2xs'
                }`}
              >
                <div className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 text-current">
                  {getModelIcon(hubGenMode === 'video' ? activeVideoModelObj.id : activeImageModelObj.id, "w-3.5 h-3.5")}
                </div>
                <span className="truncate max-w-[120px] sm:max-w-[150px]">
                  {hubGenMode === 'video' ? activeVideoModelObj.name : activeImageModelObj.name}
                </span>
                <span className="text-[10px] text-cyan-500 font-bold">✦</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {/* 模型选择弹窗 (视频模型 vs 图片模型) */}
              {showModelDropdown && (
                <div className={`absolute left-0 ${isUp ? 'bottom-full mb-3 origin-bottom' : 'top-full mt-2 origin-top'} w-88 sm:w-96 rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-3.5 z-50 animate-fade-in space-y-1.5 text-left`}>
                  <div className="px-2 py-1 text-xs text-slate-400 font-mono flex items-center justify-between border-b border-slate-100 pb-2 mb-1">
                    <span>{hubGenMode === 'video' ? '旗舰视频大模型' : '高保真生图引擎'}</span>
                    <span className="font-bold text-slate-700">
                      {hubGenMode === 'video' 
                        ? getModelProviderName(activeVideoModelObj.id, activeVideoModelObj.name, activeVideoModelObj.provider)
                        : getModelProviderName(activeImageModelObj.id, activeImageModelObj.name, activeImageModelObj.provider)}
                    </span>
                  </div>

                  {/* 视频模型列表 */}
                  {hubGenMode === 'video' ? (
                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {availableVideoModels.map(m => {
                        const isSelected = quickVideoModel === m.id;
                        const providerName = getModelProviderName(m.id, m.name, m.provider);
                        const badgeName = getModelBadgeName(m.id, m.name, m.badge);
                        const desc = getModelAccurateDescription(m.id, m.name, m.description || m.desc);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setQuickVideoModel(m.id);
                              setShowModelDropdown(false);
                            }}
                            className={`w-full text-left p-3 rounded-2xl text-xs flex items-center justify-between transition-all cursor-pointer group ${
                              isSelected 
                                ? 'bg-slate-50 border border-slate-300 text-slate-900 shadow-xs' 
                                : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="w-9 h-9 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center flex-shrink-0 mt-0.5 p-1.5 text-slate-900 group-hover:scale-105 transition-transform">
                                {getModelIcon(m.id, "w-6 h-6")}
                              </div>
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-xs text-slate-900">{m.name}</span>
                                  {m.isPrimary && <span className="text-cyan-500 font-bold text-[11px]">✦</span>}
                                  <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold">
                                    {providerName}
                                  </span>
                                  {badgeName && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 text-[9px] font-bold">
                                      {badgeName}
                                    </span>
                                  )}
                                  {m.isVip && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">
                                      VIP
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 leading-snug font-normal">
                                  {desc}
                                </p>
                              </div>
                            </div>

                            {isSelected && (
                              <Check className="w-4 h-4 text-slate-900 stroke-[2.5] flex-shrink-0 ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    /* 图片模型列表 */
                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {availableImageModels.map(m => {
                        const isSelected = quickModel === m.id;
                        const providerName = getModelProviderName(m.id, m.name, m.provider);
                        const badgeName = getModelBadgeName(m.id, m.name, m.badge);
                        const desc = getModelAccurateDescription(m.id, m.name, m.description || m.desc);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setQuickModel(m.id);
                              setShowModelDropdown(false);
                            }}
                            className={`w-full text-left p-3 rounded-2xl text-xs flex items-center justify-between transition-all cursor-pointer group ${
                              isSelected 
                                ? 'bg-slate-50 border border-slate-300 text-slate-900 shadow-xs' 
                                : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="w-9 h-9 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-center flex-shrink-0 mt-0.5 p-1.5 text-slate-900 group-hover:scale-105 transition-transform">
                                {getModelIcon(m.id, "w-6 h-6")}
                              </div>
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-extrabold text-xs text-slate-900">{m.name}</span>
                                  {m.isPrimary && <span className="text-cyan-500 font-bold text-[11px]">✦</span>}
                                  <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[9px] font-bold">
                                    {providerName}
                                  </span>
                                  {badgeName && (
                                    <span className="px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">
                                      {badgeName}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 leading-snug font-normal">
                                  {desc}
                                </p>
                              </div>
                            </div>

                            {isSelected && (
                              <Check className="w-4 h-4 text-slate-900 stroke-[2.5] flex-shrink-0 ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 药丸 2: 视频模式专用 -> 参考模式 (全能参考 ⌄ / 首尾帧 / 智能多帧) */}
            {hubGenMode === 'video' && (
              <div className="relative" ref={videoRefModeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowVideoRefModeDropdown(!showVideoRefModeDropdown)}
                  className={`h-8.5 px-3 rounded-xl font-semibold flex items-center gap-1.5 border transition-all cursor-pointer text-xs ${
                    showVideoRefModeDropdown 
                      ? 'bg-slate-50 text-slate-950 border-slate-300 shadow-2xs' 
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-2xs'
                  }`}
                >
                  <Film className="w-3.5 h-3.5 opacity-80" />
                  <span>{activeVideoRefModeObj.name}</span>
                  {quickVideoRefMode === 'multi_frame' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block -ml-0.5"></span>
                  )}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>

                {/* 参考模式下拉弹窗 (精准对照截图 3) */}
                {showVideoRefModeDropdown && (
                  <div className={`absolute left-0 ${isUp ? 'bottom-full mb-3 origin-bottom' : 'top-full mt-2 origin-top'} w-72 rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-2.5 z-50 animate-fade-in space-y-1 text-left`}>
                    <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 border-b border-slate-100 pb-2 mb-1">
                      选择视频参考模式
                    </div>

                    {VIDEO_REF_MODES.map(mode => {
                      const isSelected = quickVideoRefMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => {
                            setQuickVideoRefMode(mode.id);
                            setShowVideoRefModeDropdown(false);
                          }}
                          className={`w-full text-left p-2.5 rounded-2xl text-xs transition-all cursor-pointer group ${
                            isSelected
                              ? 'bg-slate-50 border border-slate-300 text-slate-900 shadow-xs'
                              : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-900">{mode.name}</span>
                              {mode.tag && (
                                <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold">
                                  {mode.tag}
                                </span>
                              )}
                              {mode.badge && (
                                <span className="px-1.5 py-0.2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">
                                  {mode.badge}
                                </span>
                              )}
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-slate-900 stroke-[2.5]" />}
                          </div>
                          <p className="text-[11px] text-slate-400 font-normal leading-snug">
                            {mode.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 药丸 3: 比例、分辨率与数量 (视频模式: 16:9 720P ✦ 1；图片模式: 智能比例 | high | 1) */}
            <div className="relative" ref={aspectDropdownRef}>
              <button
                type="button"
                onClick={() => setShowAspectDropdown(!showAspectDropdown)}
                className={`h-8.5 px-3 rounded-xl font-semibold flex items-center gap-1.5 border transition-all cursor-pointer text-xs ${
                  showAspectDropdown 
                    ? 'bg-slate-50 text-slate-950 border-slate-300 shadow-2xs' 
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-2xs'
                }`}
              >
                {hubGenMode === 'video' ? (
                  <>
                    {renderRatioMiniIcon(activeVideoRatioObj.iconType)}
                    <span className="font-mono text-xs font-semibold">{activeVideoRatioObj.label}</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-mono text-xs flex items-center gap-0.5 text-cyan-600 font-bold">
                      {quickVideoResolution} <span className="text-cyan-500 font-bold text-[10px]">✦</span>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="font-mono text-xs">{quickVideoCount}</span>
                  </>
                ) : (
                  <>
                    {renderRatioMiniIcon(activeImageRatioObj.iconType)}
                    <span className="font-mono text-xs font-semibold">{activeImageRatioObj.id === 'smart' ? '智能比例' : activeImageRatioObj.label}</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-xs font-bold text-cyan-600 font-mono">
                      {quickQuality === 'low' ? 'low' : quickQuality === 'medium' ? 'medium ✦' : 'high ✦'}
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="text-xs font-mono">{quickCount}</span>
                  </>
                )}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>

              {/* 弹窗：视频模式弹窗 (精准对照截图 4) vs 图片模式弹窗 */}
              {showAspectDropdown && (
                <div className={`absolute left-0 ${isUp ? 'bottom-full mb-3 origin-bottom' : 'top-full mt-2 origin-top'} w-[480px] sm:w-[520px] rounded-[32px] bg-white border border-slate-200/90 shadow-2xl p-6 z-50 animate-fade-in space-y-5 text-left`}>
                  {hubGenMode === 'video' ? (
                    /* 🌟 视频模式参数设置 (对照截图 4) */
                    <>
                      {/* Section 1: 选择比例 */}
                      <div className="space-y-2.5">
                        <div className="text-xs sm:text-sm font-bold text-slate-700">选择比例</div>
                        <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-1">
                          {VIDEO_ASPECT_RATIOS.map(r => {
                            const isSelected = quickVideoAspectId === r.id;
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setQuickVideoAspectId(r.id)}
                                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl transition-all cursor-pointer min-w-[48px] flex-1 ${
                                  isSelected 
                                    ? 'bg-slate-100 border border-slate-400 text-slate-900 font-bold shadow-xs' 
                                    : 'hover:bg-slate-50 text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                <div className="h-7 w-7 flex items-center justify-center text-current">
                                  {r.iconType === 'ultrawide' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="1" y="8" width="22" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'wide169' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="2" y="7" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'wide43' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'square' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'tall34' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'tall916' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                </div>
                                <span className="text-xs mt-1.5 font-mono font-semibold">{r.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 2: 选择分辨率 */}
                      <div className="space-y-2.5">
                        <div className="text-xs sm:text-sm font-bold text-slate-700">选择分辨率</div>
                        <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1.5">
                          {VIDEO_RESOLUTIONS.map(res => {
                            const isSelected = quickVideoResolution === res;
                            return (
                              <button
                                key={res}
                                type="button"
                                onClick={() => setQuickVideoResolution(res)}
                                className={`flex-1 py-2.5 text-xs sm:text-sm font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                  isSelected 
                                    ? 'bg-white text-slate-900 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                <span>{res}</span>
                                <span className="text-cyan-500 font-bold text-[10px]">✦</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 3: 选择生成数量 */}
                      <div className="space-y-2.5">
                        <div className="text-xs sm:text-sm font-bold text-slate-700">选择生成数量</div>
                        <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1.5">
                          {[1, 2, 3, 4].map(num => {
                            const isSelected = quickVideoCount === num;
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => setQuickVideoCount(num)}
                                className={`flex-1 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl transition-all cursor-pointer ${
                                  isSelected 
                                    ? 'bg-white text-slate-900 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    /* 🌟 图片模式参数设置 */
                    <>
                      {/* Section 1: 选择比例 */}
                      <div className="space-y-2.5">
                        <div className="text-xs sm:text-sm font-bold text-slate-700">选择比例</div>
                        <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-1">
                          {IMAGE_RATIO_ITEMS.map(r => {
                            const isSelected = quickAspectId === r.id;
                            return (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => setQuickAspectId(r.id)}
                                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl transition-all cursor-pointer min-w-[48px] flex-1 ${
                                  isSelected 
                                    ? 'bg-slate-100 border border-slate-400 text-slate-900 font-bold shadow-xs' 
                                    : 'hover:bg-slate-50 text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                <div className="h-7 w-7 flex items-center justify-center text-current">
                                  {r.iconType === 'smart' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
                                      <rect x="8" y="8" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'ultrawide' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="1" y="8" width="22" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'wide169' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="2" y="7" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'wide32' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'wide43' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'square' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'tall34' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'tall23' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="6" y="3" width="12" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                  {r.iconType === 'tall916' && (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                                      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                </div>
                                <span className="text-xs mt-1.5 font-mono font-semibold">{r.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 2: 选择质量 */}
                      <div className="space-y-2.5">
                        <div className="text-xs sm:text-sm font-bold text-slate-700">选择质量</div>
                        <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1.5">
                          {[
                            { id: 'low', label: 'low' },
                            { id: 'medium', label: 'medium ✦' },
                            { id: 'high', label: 'high ✦' }
                          ].map(q => {
                            const isSelected = quickQuality === q.id;
                            return (
                              <button
                                key={q.id}
                                type="button"
                                onClick={() => setQuickQuality(q.id as any)}
                                className={`flex-1 py-2.5 text-xs sm:text-sm font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                                  isSelected 
                                    ? 'bg-white text-slate-900 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                <span>{q.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 3: 选择生成数量 */}
                      <div className="space-y-2.5">
                        <div className="text-xs sm:text-sm font-bold text-slate-700">选择生成数量</div>
                        <div className="bg-slate-100/90 p-1.5 rounded-2xl flex items-center gap-1.5">
                          {[1, 2, 3, 4].map(num => {
                            const isSelected = quickCount === num;
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => setQuickCount(num)}
                                className={`flex-1 py-2 text-xs sm:text-sm font-mono font-bold rounded-xl transition-all cursor-pointer ${
                                  isSelected 
                                    ? 'bg-white text-slate-900 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Section 4: 尺寸数值 */}
                      <div className="space-y-2 pt-1">
                        <div className="text-xs sm:text-sm font-bold text-slate-700">尺寸</div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-mono text-slate-600 flex items-center justify-between shadow-2xs">
                            <span className="text-slate-400 font-bold">W</span>
                            <span className="font-extrabold text-slate-900 text-base">{currentW}</span>
                          </div>
                          <LinkIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <div className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-sm font-mono text-slate-600 flex items-center justify-between shadow-2xs">
                            <span className="text-slate-400 font-bold">H</span>
                            <span className="font-extrabold text-slate-900 text-base">{currentH}</span>
                          </div>
                          <span className="text-xs font-bold text-slate-400 font-mono">PX</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 药丸 4: 视频模式专用 -> 时长选择 (⏱ 4s，精准对照截图滑块浮窗) */}
            {hubGenMode === 'video' && (
              <div className="relative" ref={durationDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowDurationDropdown(!showDurationDropdown)}
                  className={`h-8.5 px-3 rounded-xl font-semibold flex items-center gap-1.5 border transition-all cursor-pointer text-xs ${
                    showDurationDropdown 
                      ? 'bg-slate-50 text-slate-950 border-slate-300 shadow-2xs' 
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-2xs'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 opacity-80 text-current" />
                  <span className="font-mono text-xs font-bold">{quickVideoDuration}s</span>
                </button>

                {/* 🌟 时长选择器弹窗 (精准100%对照用户截图: 选择视频生成时长 滑块与数值框) */}
                {showDurationDropdown && (
                  <div className={`absolute left-0 ${isUp ? 'bottom-full mb-3 origin-bottom' : 'top-full mt-2 origin-top'} w-80 sm:w-96 rounded-3xl bg-white border border-slate-200/90 shadow-2xl p-4 sm:p-5 z-50 animate-fade-in text-left select-none`}>
                    <div className="text-xs font-semibold text-slate-500 mb-3.5">
                      选择视频生成时长
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {/* 滑块区域 */}
                      <div className="flex-1 relative pb-4">
                        {/* 滑轨容器 */}
                        <div className="relative w-full h-2 rounded-full bg-slate-100 overflow-visible flex items-center">
                          {/* 激活进度 */}
                          <div 
                            className="h-full rounded-full bg-slate-300 transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, (quickVideoDuration / 15) * 100))}%` }}
                          />
                          {/* 滑块按键 */}
                          <div 
                            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-slate-300 shadow-sm pointer-events-none transition-all"
                            style={{ left: `calc(${Math.min(100, Math.max(0, (quickVideoDuration / 15) * 100))}% - 8px)` }}
                          />
                          {/* 刻度点 */}
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-2 bg-slate-200 pointer-events-none rounded-xs" />
                          <div className="absolute left-[33.3%] top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-300 pointer-events-none rounded-xs" />
                          <div className="absolute left-[66.6%] top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-slate-300 pointer-events-none rounded-xs" />
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-2 bg-slate-200 pointer-events-none rounded-xs" />
                        </div>

                        {/* 原生滑块响应拖动与点击 */}
                        <input
                          type="range"
                          min="1"
                          max="15"
                          step="1"
                          value={quickVideoDuration}
                          onChange={(e) => setQuickVideoDuration(parseInt(e.target.value, 10) || 5)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />

                        {/* 刻度数字 */}
                        <div className="absolute -bottom-1 inset-x-0 flex justify-between text-[11px] font-mono text-slate-400 font-medium pointer-events-none">
                          <span>0</span>
                          <span className="relative -left-1">5</span>
                          <span className="relative left-1">10</span>
                          <span>15</span>
                        </div>
                      </div>

                      {/* 右侧数值卡片 (例如: 4 s) */}
                      <div className="w-16 h-10 rounded-2xl bg-slate-100/90 border border-slate-200/60 flex items-center justify-center gap-1 shadow-2xs flex-shrink-0">
                        <span className="font-extrabold text-slate-900 text-sm font-mono">{quickVideoDuration}</span>
                        <span className="text-xs text-slate-400 font-medium">s</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 药丸 5: @ 主体/素材引用快捷按钮 (对照截图方形圆角) */}
            <button
              type="button"
              onClick={() => {
                if (richInputRef.current) {
                  setCursorPosition(richInputRef.current.getSelectionStart());
                }
                setShowAtMenu(!showAtMenu);
              }}
              className={`w-8.5 h-8.5 rounded-xl font-bold flex items-center justify-center border transition-all cursor-pointer ${
                showAtMenu 
                  ? 'bg-slate-50 text-slate-950 border-slate-300 shadow-2xs' 
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/90 shadow-2xs'
              }`}
              title="输入 @ 快速绑定图片主体或素材"
            >
              <span className="font-mono text-sm leading-none">@</span>
            </button>
          </div>

          {/* 右侧：圆形发射/提交按钮 */}
          <div className="flex items-center gap-2.5 sm:gap-3 ml-auto">

            <button
              type="button"
              onClick={handleSendPrompt}
              disabled={isSubmitting || (!quickPrompt.trim() && quickRefImages.length === 0 && activeSubjects.length === 0 && !quickVideoFirstFrame)}
              className={`w-8.5 h-8.5 sm:w-9.5 sm:h-9.5 rounded-full flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 ${
                !isSubmitting && (quickPrompt.trim() || quickRefImages.length > 0 || activeSubjects.length > 0 || quickVideoFirstFrame)
                  ? 'bg-slate-900 hover:bg-black text-white shadow-md hover:scale-105'
                  : 'bg-[#E3E5EB] text-slate-400 cursor-not-allowed'
              }`}
              title={hubGenMode === 'video' ? '开始生成视频' : '立即生成图片'}
            >
              {isSubmitting ? (
                <Loader2 className="w-4.5 h-4.5 animate-spin text-white" />
              ) : (
                <ArrowUp className="w-4.5 h-4.5 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
