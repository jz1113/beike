'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { useScrollLock } from '@/lib/useScrollLock';
import { useFileDropZone } from '@/lib/useFileDropZone';
import { isImageOrVideoFile, processDroppedMediaFiles } from '@/lib/mediaUpload';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import { cleanPromptText, normalizeImageUrlToStandardJpg, stripWorkshopPromptGuards } from '@/lib/drawing';
import { isVideoMediaUrl } from '@/lib/mediaHelper';
import {
  getEnabledImageModelsFromSettings,
  getEnabledVideoModelsFromSettings,
  readWorkflowModelsFromStorage,
} from '@/lib/workflowModels';
import GlitchText from '@/shared/media/GlitchText';
import { 
  VIDEO_GEN_MODELS, 
  VIDEO_ASPECT_RATIOS, 
  VIDEO_REF_MODES, 
  VIDEO_RESOLUTIONS, 
  VIDEO_DURATIONS,
  getVideoDurationBounds,
  clampVideoDuration,
  VideoGenModel 
} from '@/lib/video';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { compactPill } from '@/shared/ui/layoutClasses';
import { ShellTechLogo } from '@/shared/ui/BrandIcons';
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
import { IMAGE_RATIO_ITEMS } from './promptBarConstants';
import { isGptImageModelId, resolveGptImageHubSize } from './gptImageGatewaySizes';
import {
  getModelProviderName,
  getModelAccurateDescription,
  getModelBadgeName,
  renderRatioMiniIcon,
} from './modelDisplayHelpers';
import PromptBarBrandHero from './PromptBarBrandHero';
import PromptBarRefMediaPanel from './PromptBarRefMediaPanel';
import PromptBarModelPicker from './PromptBarModelPicker';
import PromptBarImageControls from './PromptBarImageControls';
import {
  PromptBarVideoRefModePill,
  PromptBarVideoDurationPill,
  PromptBarVideoParamsPanel,
} from './PromptBarVideoControls';

export {
  getModelProviderName,
  getModelAccurateDescription,
  getModelBadgeName,
  renderRatioMiniIcon,
} from './modelDisplayHelpers';

interface Props {
  onStartGenerate?: (task: GenerationTask) => void;
  onOpenProductVault?: () => void;
  dropdownPlacement?: 'up' | 'down' | 'auto';
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
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showAspectDropdown, setShowAspectDropdown] = useState(false);
  const [showVideoRefModeDropdown, setShowVideoRefModeDropdown] = useState(false);
  const [showDurationDropdown, setShowDurationDropdown] = useState(false);
  const [isExpandedRefImages, setIsExpandedRefImages] = useState(false);

  // @ 主体选择相关状态 (支持同时@多个主体，如 @insp_1, @insp_2)
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const [activeSubjects, setActiveSubjects] = useState<SubjectItem[]>([]);
  const activeSubject = activeSubjects[0] || null;
  const [customSubjects, setCustomSubjects] = useState<SubjectItem[]>([]);
  const [refImageNames, setRefImageNames] = useState<Record<string, string>>({});

  const anyDropdownOpen =
    showModeDropdown ||
    showModelDropdown ||
    showAspectDropdown ||
    showVideoRefModeDropdown ||
    showDurationDropdown ||
    showAtMenu;

  useScrollLock(
    anyDropdownOpen,
    currentView === 'generate' ? '[data-generate-scroll]' : '[data-hub-scroll]',
  );

  const hoverRefImagesTimeout = useRef<NodeJS.Timeout | null>(null);

  // 外部「做同款」灌入素材后自动展开
  useEffect(() => {
    if (quickRefImages.length === 0) return;
    setIsExpandedRefImages(true);
  }, [quickRefImages]);

  useEffect(() => {
    return () => {
      if (hoverRefImagesTimeout.current) clearTimeout(hoverRefImagesTimeout.current);
    };
  }, []);

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
  const [availableImageModels, setAvailableImageModels] = useState<any[]>([]);
  const [availableVideoModels, setAvailableVideoModels] = useState<any[]>(VIDEO_GEN_MODELS);

  useEffect(() => {
    const loadCustomModels = () => {
      const all = readWorkflowModelsFromStorage();
      const customImage = getEnabledImageModelsFromSettings(all);
      const customVideo = getEnabledVideoModelsFromSettings(all);

      // 设置页为唯一真相源：只展示用户已启用的生图/视频模型
      setAvailableImageModels(customImage);
      if (customImage.length > 0) {
        const savedImg = localStorage.getItem('ai_image_gen_model');
        if (savedImg && customImage.some((m: any) => m.id === savedImg)) {
          setQuickModel(savedImg);
        } else if (!customImage.some((m: any) => m.id === quickModel)) {
          setQuickModel(customImage[0].id as string);
        }
      }

      if (customVideo.length > 0) {
        setAvailableVideoModels(customVideo);
        const savedVid = localStorage.getItem('ai_video_gen_model');
        if (savedVid && customVideo.some((m: any) => m.id === savedVid)) {
          setQuickVideoModel(savedVid);
        } else if (!customVideo.some((m: any) => m.id === quickVideoModel)) {
          setQuickVideoModel(customVideo[0].id as string);
        }
      } else {
        setAvailableVideoModels(VIDEO_GEN_MODELS);
      }
    };

    loadCustomModels();
    window.addEventListener('models_updated', loadCustomModels);
    return () => window.removeEventListener('models_updated', loadCustomModels);
  }, []);

  // 当前激活的图片模型与比例
  const activeImageModelObj = availableImageModels.find(m => m.id === quickModel) || availableImageModels[0] || { id: '', name: '请从网关拉取生图模型', provider: 'Gateway' };
  const activeImageRatioObj = IMAGE_RATIO_ITEMS.find(r => r.id === quickAspectId) || IMAGE_RATIO_ITEMS[0];

  // 当前激活的视频模型、参考模式与比例
  const activeVideoModelObj = availableVideoModels.find(m => m.id === quickVideoModel) || availableVideoModels[0] || VIDEO_GEN_MODELS[0];
  const activeVideoRefModeObj = VIDEO_REF_MODES.find(m => m.id === quickVideoRefMode) || VIDEO_REF_MODES[0];
  const activeVideoRatioObj = VIDEO_ASPECT_RATIOS.find(r => r.id === quickVideoAspectId) || VIDEO_ASPECT_RATIOS[1];
  const videoDurationBounds = getVideoDurationBounds(activeVideoModelObj?.id || quickVideoModel);

  // 切换视频模型时，将时长吸附到该模型支持范围
  useEffect(() => {
    if (hubGenMode !== 'video') return;
    const next = clampVideoDuration(activeVideoModelObj?.id || quickVideoModel, quickVideoDuration);
    if (next !== quickVideoDuration) {
      setQuickVideoDuration(next);
    }
  }, [hubGenMode, quickVideoModel, activeVideoModelObj?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 计算图片尺寸数值
  const getCalculatedImageSize = () => {
    if (isGptImageModelId(quickModel)) {
      const sizeStr = resolveGptImageHubSize(quickAspectId, quickModel, quickQuality);
      const [w, h] = sizeStr.split('x').map(Number);
      return { w, h, sizeStr };
    }
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

  // 拖拽 / 粘贴上传支持
  const rejectDrop = useCallback(() => {
    showToast('无法识别拖入的文件，请使用 JPG/PNG/WebP 等图片或 MP4/MOV 视频');
  }, [showToast]);

  const ingestMediaFiles = useCallback(
    (files: File[]) => {
      void processDroppedMediaFiles(files, (url, origName) => {
        setRefImageNames((prev) => ({ ...prev, [url]: origName }));
        addQuickRefImage(url);
        setIsExpandedRefImages(true);
      }, { onAllSkipped: rejectDrop, onError: (msg) => showToast(msg) }).catch(() => showToast('无法读取拖入的文件'));
    },
    [addQuickRefImage, rejectDrop],
  );

  const { dropZoneProps } = useFileDropZone({
    onFiles: ingestMediaFiles,
    accept: isImageOrVideoFile,
    onReject: rejectDrop,
  });

  const handlePasteFiles = (files: File[]) => {
    ingestMediaFiles(files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    const imageFiles: File[] = [];

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      handlePasteFiles(imageFiles);
    }
  };

  // 发送任务 (支持图片生图与视频生成，确保多主体与内联引用 100% 映射与调用)
  const handleSendPrompt = async () => {
    if (hubGenMode === 'image' && availableImageModels.length === 0) {
      showToast('请先在设置中从网关拉取生图模型');
      return;
    }

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
        showToast('请输入描述你想生成的视频提示词，或上传首帧/尾帧图片');
      } else if (hubGenMode === 'video' && quickVideoRefMode === 'multi_frame') {
        showToast('请添加智能多帧的镜头或输入视频生成描述');
      } else {
        showToast(hubGenMode === 'video' ? '请输入描述你想生成的视频提示词或上传参考素材' : '请输入描述你想生成的图片提示词或选择图片主体');
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

    const cleanedPrompt = stripWorkshopPromptGuards(cleanPromptText(finalPrompt));
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

    // 🌟 核心：在主页发起生图自动开启新会话；在生成工作台内则追加到当前会话
    const shouldCreateNewSession = currentView !== 'generate';
    addBatchHubGenerations(tasksToCreate, cleanedPrompt.slice(0, 18) || (hubGenMode === 'video' ? '智能视频创作' : '快速商用生图'), shouldCreateNewSession);

    // 🌟 核心优化：提交生成后，立即彻底清空输入框文字与已上传的垫图/参考图/首尾帧素材
    setQuickPrompt('');
    setQuickRefImages([]);
    setActiveSubjects([]);
    setQuickVideoFirstFrame(null);
    setQuickVideoLastFrame(null);
    setQuickVideoMultiFrames([]);
    setIsExpandedRefImages(false);

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

  const isGenerateDock = currentView === 'generate';

  return (
    <div className="w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1460px] mx-auto select-none">
      {/* 🌟 1. 顶部主标题：贝壳云图 (顶级极简现代视觉设计) */}
      {currentView !== 'generate' && <PromptBarBrandHero />}

      {/* 🌟 2. 核心指令生成控制大卡片 (即梦同款纯净白底高圆角与柔和微阴影) */}
      <div 
        {...dropZoneProps}
        onPaste={handlePaste}
        className={`relative bg-white border border-slate-200/90 shadow-[0_12px_45px_rgba(0,0,0,0.04)] hover:shadow-[0_16px_55px_rgba(0,0,0,0.065)] transition-all ${
          isGenerateDock
            ? 'rounded-2xl sm:rounded-[36px] p-4 sm:p-7'
            : 'rounded-[36px] sm:rounded-[48px] p-5 sm:p-9'
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
        <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4.5">
          {/* 左侧多图垫图展示/上传方块 (支持首尾帧专属双卡片 & 悬停多图平铺) */}
          <PromptBarRefMediaPanel
            hubGenMode={hubGenMode}
            quickVideoRefMode={quickVideoRefMode}
            quickVideoFirstFrame={quickVideoFirstFrame}
            quickVideoLastFrame={quickVideoLastFrame}
            quickVideoMultiFrames={quickVideoMultiFrames}
            quickRefImages={quickRefImages}
            isExpandedRefImages={isExpandedRefImages}
            setIsExpandedRefImages={setIsExpandedRefImages}
            setQuickVideoFirstFrame={setQuickVideoFirstFrame}
            setQuickVideoLastFrame={setQuickVideoLastFrame}
            swapVideoFirstLastFrames={swapVideoFirstLastFrames}
            removeQuickVideoMultiFrame={removeQuickVideoMultiFrame}
            removeQuickRefImage={removeQuickRefImage}
            onUploadClick={() => fileInputRef.current?.click()}
            onFirstFrameClick={() => firstFrameInputRef.current?.click()}
            onLastFrameClick={() => lastFrameInputRef.current?.click()}
            onMultiFrameClick={() => multiFrameInputRef.current?.click()}
            refImagesContainerRef={refImagesContainerRef}
            onMouseEnterRefImages={handleMouseEnterRefImages}
            onMouseLeaveRefImages={handleMouseLeaveRefImages}
          />

          {/* 中间输入框区域 (即梦同款纯净内联版式，顶行开始输入) */}
          <div className="flex-1 min-w-0 w-full py-0.5 relative flex items-start min-h-[72px] sm:min-h-[96px] lg:min-h-[112px]">
            <RichPromptInput
              ref={richInputRef}
              value={quickPrompt}
              onChange={setQuickPrompt}
              onKeyDown={handleKeyDown}
              onPasteFiles={handlePasteFiles}
              placeholder={
                hubGenMode === 'video'
                  ? (quickVideoRefMode === 'multi_frame'
                      ? "请添加智能多帧的镜头"
                      : quickVideoRefMode === 'first_last_frame'
                        ? (isGenerateDock ? "描述画面内容与运动过程..." : "输入文字，描述你想创作的画面内容、运动过程...")
                        : (isGenerateDock ? "上传参考素材或 @ 内容，描述视频..." : "上传最多50个参考素材、输入文字或 @ 参考内容，自由组合图、文、音、视频多元素，定义精彩互动。例如：@图片1 模仿 @视频1 的动作，音色参考 @音频1，"))
                  : (isGenerateDock ? "上传参考图、输入文字或 @ 主体..." : "上传参考图、输入文字或 @ 主体，描述你想生成的图片。")
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
                <div className="max-h-48 overflow-y-auto scroll-contain space-y-1 pt-1">
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
                              src={normalizeImageUrlToStandardJpg(sub.url)} 
                              alt="" 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (!target.dataset.hasRetried && sub.url) {
                                  target.dataset.hasRetried = 'true';
                                  target.src = proxyMediaUrl(sub.url);
                                }
                              }}
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
        <div className="mt-4 pt-4 sm:mt-6 sm:pt-5 lg:mt-7 lg:pt-6 border-t border-slate-100/90 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3.5 text-xs sm:text-sm">
          {/* 左侧药丸按钮组 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* 药丸 0: 模式切换药丸 (视频生成 ⌄ / 图片生成 ⌄) */}
            <div className="relative" ref={modeDropdownRef}>
              <button
                type="button"
                onClick={() => setShowModeDropdown(!showModeDropdown)}
                className={`${compactPill} px-3 sm:px-5 rounded-2xl font-semibold flex items-center gap-1.5 sm:gap-2.5 transition-all cursor-pointer border ${
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
                    <svg viewBox="0 0 24 24" fill="none" className="w-4.5 h-4.5 stroke-cyan-600 stroke-[2] flex-shrink-0">
                      <rect x="2.5" y="4" width="13.5" height="16" rx="3.5" />
                      <path d="M16 9.5L21.5 6.5V17.5L16 14.5" strokeLinecap="round" strokeLinejoin="round" />
                      <polygon points="7.5,9.5 7.5,14.5 11.5,12" className="fill-cyan-600 stroke-none" />
                    </svg>
                    <span className="hidden sm:inline">视频生成</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" className="w-4.5 h-4.5 stroke-sky-600 stroke-[2] flex-shrink-0">
                      <rect x="3" y="3" width="18" height="18" rx="4" />
                      <circle cx="8.5" cy="8.5" r="1.5" className="fill-sky-600 stroke-none" />
                      <path d="M21 15L16 10L6 20" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="hidden sm:inline">图片生成</span>
                  </>
                )}
                <ChevronDown className="w-4 h-4 opacity-60 ml-0.5" />
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

            <PromptBarModelPicker
              isUp={isUp}
              hubGenMode={hubGenMode}
              showModelDropdown={showModelDropdown}
              setShowModelDropdown={setShowModelDropdown}
              modelDropdownRef={modelDropdownRef}
              activeVideoModelObj={activeVideoModelObj}
              activeImageModelObj={activeImageModelObj}
              availableVideoModels={availableVideoModels}
              availableImageModels={availableImageModels}
              quickVideoModel={quickVideoModel}
              quickModel={quickModel}
              quickVideoDuration={quickVideoDuration}
              setQuickVideoModel={setQuickVideoModel}
              setQuickVideoDuration={setQuickVideoDuration}
              setQuickModel={setQuickModel}
            />

            {hubGenMode === 'video' && (
              <PromptBarVideoRefModePill
                isUp={isUp}
                showVideoRefModeDropdown={showVideoRefModeDropdown}
                setShowVideoRefModeDropdown={setShowVideoRefModeDropdown}
                videoRefModeDropdownRef={videoRefModeDropdownRef}
                activeVideoRefModeObj={activeVideoRefModeObj}
                quickVideoRefMode={quickVideoRefMode}
                setQuickVideoRefMode={setQuickVideoRefMode}
              />
            )}

            {/* 药丸 3: 比例、分辨率与数量 (视频模式: 16:9 720P ✦ 1；图片模式: 智能比例 | high | 1) */}
            <div className="relative" ref={aspectDropdownRef}>
              <button
                type="button"
                onClick={() => setShowAspectDropdown(!showAspectDropdown)}
                className={`${compactPill} px-3 sm:px-5 rounded-2xl font-semibold flex items-center gap-1.5 sm:gap-2.5 border transition-all cursor-pointer ${
                  showAspectDropdown 
                    ? 'bg-slate-50 text-slate-950 border-slate-300 shadow-2xs' 
                    : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200/90 shadow-2xs'
                }`}
              >
                {hubGenMode === 'video' ? (
                  <>
                    {renderRatioMiniIcon(activeVideoRatioObj.iconType, "w-4.5 h-4.5 opacity-80 shrink-0")}
                    <span className="font-mono hidden sm:inline">{activeVideoRatioObj.label}</span>
                    <span className="text-slate-300 hidden sm:inline">|</span>
                    <span className="font-mono flex items-center gap-0.5 text-cyan-600 font-bold">
                      {quickVideoResolution} <span className="text-cyan-500 font-bold text-[11px]">✦</span>
                    </span>
                    <span className="text-slate-300 hidden sm:inline">|</span>
                    <span className="font-mono">{quickVideoCount}</span>
                  </>
                ) : (
                  <>
                    {renderRatioMiniIcon(activeImageRatioObj.iconType, "w-4.5 h-4.5 opacity-80 shrink-0")}
                    <span className="font-mono hidden sm:inline">{activeImageRatioObj.id === 'smart' ? '智能比例' : activeImageRatioObj.label}</span>
                    <span className="text-slate-300 hidden sm:inline">|</span>
                    <span className="font-bold text-cyan-600 font-mono">
                      {quickQuality === 'low' ? '1K' : quickQuality === 'medium' ? '2K ✦' : '4K ✦'}
                    </span>
                    <span className="text-slate-300 hidden sm:inline">|</span>
                    <span className="font-mono">{quickCount}</span>
                  </>
                )}
                <ChevronDown className="w-4 h-4 opacity-60" />
              </button>

              {showAspectDropdown && (
                <div className={`absolute left-0 ${isUp ? 'bottom-full mb-3 origin-bottom' : 'top-full mt-2 origin-top'} w-[min(520px,calc(100vw-2rem))] rounded-[32px] bg-white border border-slate-200/90 shadow-2xl p-6 z-50 animate-fade-in space-y-5 text-left`}>
                  {hubGenMode === 'video' ? (
                    <PromptBarVideoParamsPanel
                      quickVideoAspectId={quickVideoAspectId}
                      setQuickVideoAspectId={setQuickVideoAspectId}
                      quickVideoResolution={quickVideoResolution}
                      setQuickVideoResolution={setQuickVideoResolution}
                      quickVideoCount={quickVideoCount}
                      setQuickVideoCount={setQuickVideoCount}
                    />
                  ) : (
                    <PromptBarImageControls
                      quickAspectId={quickAspectId}
                      setQuickAspectId={setQuickAspectId}
                      quickQuality={quickQuality}
                      setQuickQuality={setQuickQuality}
                      quickCount={quickCount}
                      setQuickCount={setQuickCount}
                      currentW={currentW}
                      currentH={currentH}
                      imageModelId={quickModel}
                    />
                  )}
                </div>
              )}
            </div>

            </div>

            {hubGenMode === 'video' && (
              <PromptBarVideoDurationPill
                isUp={isUp}
                showDurationDropdown={showDurationDropdown}
                setShowDurationDropdown={setShowDurationDropdown}
                durationDropdownRef={durationDropdownRef}
                quickVideoDuration={quickVideoDuration}
                setQuickVideoDuration={setQuickVideoDuration}
                videoDurationBounds={videoDurationBounds}
                activeVideoModelObj={activeVideoModelObj}
                quickVideoModel={quickVideoModel}
              />
            )}

                    {/* 右侧：圆形发射/提交按钮 (大幅放大至 w-13.5 h-13.5 纯黑徽标) */}
          <div className="flex items-center gap-3 sm:gap-3.5 ml-auto">
            <button
              type="button"
              onClick={handleSendPrompt}
              disabled={
                isSubmitting
                || (hubGenMode === 'image' && availableImageModels.length === 0)
                || (!quickPrompt.trim() && quickRefImages.length === 0 && activeSubjects.length === 0 && !quickVideoFirstFrame)
              }
              className={`w-10 h-10 sm:w-12.5 sm:h-12.5 lg:w-14 lg:h-14 rounded-full flex items-center justify-center transition-all cursor-pointer select-none active:scale-95 shadow-md ${
                !isSubmitting
                && !(hubGenMode === 'image' && availableImageModels.length === 0)
                && (quickPrompt.trim() || quickRefImages.length > 0 || activeSubjects.length > 0 || quickVideoFirstFrame)
                  ? 'bg-slate-900 hover:bg-black text-white shadow-lg hover:scale-105'
                  : 'bg-[#E3E5EB] text-slate-400 cursor-not-allowed'
              }`}
              title={hubGenMode === 'video' ? '开始生成视频' : '立即生成图片'}
            >
              {isSubmitting ? (
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              ) : (
                <ArrowUp className="w-6 h-6 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </div>
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-medium shadow-xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
