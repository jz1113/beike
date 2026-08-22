'use client';
import { useState, useEffect, useRef } from 'react';
import { proxyMediaUrl } from '@/lib/apiClient';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import { IMAGE_GEN_MODELS, normalizeImageUrlToStandardJpg, cleanPromptText, stripWorkshopPromptGuards } from '@/lib/drawing';
import { getEnabledImageModelsFromSettings, readWorkflowModelsFromStorage } from '@/lib/workflowModels';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { 
  Sparkles, 
  X, 
  Check, 
  Image as ImageIcon, 
  Layers, 
  Copy, 
  Wand2, 
  CheckCircle2,
  Trash2, 
  Plus, 
  Loader2,
  ChevronDown,
  Zap,
  CheckCheck,
  UserCheck,
  Ban
} from 'lucide-react';

export interface ParsedShotItem {
  id: string;
  title: string;
  prompt: string;
  aspectRatio: string;
  refImage?: string; // 兼容旧单图字段
  refImages?: string[]; // 🌟 核心：多图参考数组 (支持同时引用两张图片：图1商品 + 图2人物一致性模特)
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  shots: ParsedShotItem[];
  availableImages: { url: string; label: string }[]; // 会话中可用的所有参考图
  onGenerateSuccess?: () => void;
}

const COMMON_RATIOS = ['3:4', '1:1', '9:16', '16:9'];

/** 同步提示词中的 --ar / 画幅比例 文案 */
export function syncPromptAspectRatio(prompt: string, ratio: string): string {
  let next = (prompt || '').trim();
  if (!next) return `--ar ${ratio}`;
  if (/--ar\s*[\d.:]+/i.test(next)) {
    next = next.replace(/--ar\s*[\d.:]+/gi, `--ar ${ratio}`);
  } else {
    next = `${next} --ar ${ratio}`;
  }
  next = next.replace(/画幅比例\s*[:：]?\s*[\d.:]+/gi, `画幅比例${ratio}`);
  next = next.replace(/画幅\s*[:：]\s*[\d.:]+/gi, `画幅: ${ratio}`);
  return next.replace(/\s{2,}/g, ' ').trim();
}

export default function BatchPromptModal({
  isOpen,
  onClose,
  shots: initialShots,
  availableImages,
  onGenerateSuccess
}: Props) {
  const { 
    addBatchHubGenerations, 
    setCurrentView,
    selectedImageGenModel,
    setSelectedImageGenModel,
    selectedQuality,
    setSelectedQuality,
    setGeneratedPrompts,
    setStep,
    setProductData,
    product,
    setIsAssistantOpen
  } = useAppStore();

  const [shots, setShots] = useState<ParsedShotItem[]>([]);
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // 🌟 生图模型与画质选择下拉状态
  const [availableImageModels, setAvailableImageModels] = useState<any[]>([]);
  const [currentModelId, setCurrentModelId] = useState<string>(selectedImageGenModel || 'gpt-image-2');
  const [currentQuality, setCurrentQuality] = useState<'high' | 'medium' | 'low'>((selectedQuality as any) || 'high');
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // 动态加载设置页中已启用的生图模型（唯一真相源，不显示未配置模型）
  useEffect(() => {
    const loadCustomImageModels = () => {
      const all = readWorkflowModelsFromStorage();
      const customImg = getEnabledImageModelsFromSettings(all);
      if (customImg.length > 0) {
        setAvailableImageModels(customImg);
        const savedImg = localStorage.getItem('ai_image_gen_model');
        if (savedImg && customImg.some((m: any) => m.id === savedImg)) {
          setCurrentModelId(savedImg);
        } else if (!customImg.some((m: any) => m.id === currentModelId)) {
          const fallbackId = (customImg[0].id as string) || 'gpt-image-2';
          setCurrentModelId(fallbackId);
          setSelectedImageGenModel(fallbackId);
        }
      } else {
        setAvailableImageModels([]);
      }
    };

    loadCustomImageModels();
    window.addEventListener('models_updated', loadCustomImageModels);
    return () => window.removeEventListener('models_updated', loadCustomImageModels);
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  useEffect(() => {
    if (selectedImageGenModel) {
      setCurrentModelId(selectedImageGenModel);
    }
  }, [selectedImageGenModel]);

  useEffect(() => {
    if (selectedQuality) {
      setCurrentQuality(selectedQuality);
    }
  }, [selectedQuality]);

  // 仅在弹窗打开瞬间初始化一次，避免父级 availableImages 引用变化把本地编辑冲掉
  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    if (initialShots.length === 0) return;
    initializedRef.current = true;

    const defaultRefs = availableImages.slice(0, 2).map(img => normalizeImageUrlToStandardJpg(img.url)).filter(Boolean);
    const defaultRef1 = availableImages.length > 0 ? normalizeImageUrlToStandardJpg(availableImages[0].url) : undefined;

    const normalizedShots = initialShots.map((shot, idx) => {
      let finalRefImages: string[] = [];
      if (Array.isArray(shot.refImages) && shot.refImages.length > 0) {
        finalRefImages = shot.refImages.map(normalizeImageUrlToStandardJpg).filter(Boolean);
      } else if (shot.refImage) {
        finalRefImages = [normalizeImageUrlToStandardJpg(shot.refImage)].filter(Boolean);
      } else if (defaultRefs.length >= 2) {
        finalRefImages = defaultRefs;
      } else if (defaultRef1) {
        finalRefImages = [defaultRef1];
      }

      const aspectRatio = shot.aspectRatio || '3:4';
      return {
        ...shot,
        aspectRatio,
        prompt: syncPromptAspectRatio(shot.prompt || '', aspectRatio),
        refImages: finalRefImages,
        refImage: finalRefImages[0] || undefined,
        title: shot.title || `📸 第 ${idx + 1} 张分镜`
      };
    });
    setShots(normalizedShots);
    setSelectedShotIds(normalizedShots.map(s => s.id));
  }, [isOpen, initialShots, availableImages]);

  if (!isOpen) return null;

  const currentModelConfig = availableImageModels.find(m => m.id === currentModelId) || availableImageModels[0] || { name: currentModelId, id: currentModelId };

  // 切换生图模型
  const handleSelectModel = (modelId: string) => {
    setCurrentModelId(modelId);
    setSelectedImageGenModel(modelId);
    setShowModelMenu(false);
    const found = availableImageModels.find(m => m.id === modelId);
    showToast(`⚡ 已切换生图引擎为：${found?.name || modelId}`);
  };

  // 切换画质
  const handleSelectQuality = (quality: 'high' | 'medium' | 'low') => {
    setCurrentQuality(quality);
    setSelectedQuality(quality);
    setShowQualityMenu(false);
  };

  // 勾选/取消单张
  const handleToggleSelect = (id: string) => {
    if (selectedShotIds.includes(id)) {
      setSelectedShotIds(prev => prev.filter(i => i !== id));
    } else {
      setSelectedShotIds(prev => [...prev, id]);
    }
  };

  // 全选 / 取消全选
  const handleSelectAll = () => {
    if (selectedShotIds.length === shots.length) {
      setSelectedShotIds([]);
    } else {
      setSelectedShotIds(shots.map(s => s.id));
    }
  };

  // 🌟 一键将全部待生图分镜统一绑定【图1 (主商品) + 图2 (人物一致性)】双图参考
  const handleApplyImg1AndImg2ToAll = () => {
    if (availableImages.length < 2) return;
    const dualUrls = [
      normalizeImageUrlToStandardJpg(availableImages[0].url),
      normalizeImageUrlToStandardJpg(availableImages[1].url)
    ].filter(Boolean);

    setShots(prev => prev.map(s => ({
      ...s,
      refImages: dualUrls,
      refImage: dualUrls[0] || undefined
    })));
    showToast('✨ 已将所有分镜统一绑定【图1 (主商品) + 图2 (人物一致性)】双图参考！');
  };

  // 一键将全部待生图分镜的垫图统一设为【图1 (主商品)】
  const handleApplyImg1ToAll = () => {
    if (availableImages.length === 0) return;
    const img1Url = normalizeImageUrlToStandardJpg(availableImages[0].url);
    setShots(prev => prev.map(s => ({ 
      ...s, 
      refImages: [img1Url],
      refImage: img1Url 
    })));
    showToast('🖼️ 已将所有分镜的参考图统一设置为【图1 (主商品)】单图参考！');
  };

  // 一键清空所有分镜的参考图 (纯文生图)
  const handleClearAllRefImages = () => {
    setShots(prev => prev.map(s => ({
      ...s,
      refImages: [],
      refImage: undefined
    })));
    showToast('🚫 已将所有分镜切换为纯文生图 (无垫图)！');
  };

  // 一键统一全部选中的分镜画幅比例（同步提示词 --ar）
  const handleApplyGlobalRatio = (ratio: string) => {
    setShots(prev => prev.map(s =>
      selectedShotIds.includes(s.id)
        ? { ...s, aspectRatio: ratio, prompt: syncPromptAspectRatio(s.prompt, ratio) }
        : s
    ));
    showToast(`📐 已将选中的 ${selectedShotIds.length} 组分镜画幅统一为 ${ratio}！`);
  };

  // 修改单张分镜提示词
  const handleUpdatePrompt = (id: string, newPrompt: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, prompt: newPrompt } : s));
  };

  // 🌟 单张分镜切换多图选中/反选状态 (支持同时勾选 图1 + 图2 等多图)
  const handleToggleShotRefImage = (id: string, imgUrl: string) => {
    const cleanUrl = normalizeImageUrlToStandardJpg(imgUrl);
    setShots(prev => prev.map(s => {
      if (s.id !== id) return s;
      const currentList = s.refImages || (s.refImage ? [s.refImage] : []);
      const exists = currentList.includes(cleanUrl);
      const updated = exists ? currentList.filter(u => u !== cleanUrl) : [...currentList, cleanUrl];
      return {
        ...s,
        refImages: updated,
        refImage: updated[0] || undefined
      };
    }));
  };

  // 单张分镜设为无垫图
  const handleClearShotRefImages = (id: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, refImages: [], refImage: undefined } : s));
  };

  // 修改单张比例（同步提示词）
  const handleUpdateAspectRatio = (id: string, ratio: string) => {
    setShots(prev => prev.map(s =>
      s.id === id
        ? { ...s, aspectRatio: ratio, prompt: syncPromptAspectRatio(s.prompt, ratio) }
        : s
    ));
  };

  // 复制全部选中的提示词
  const handleCopyAllPrompts = () => {
    const selected = shots.filter(s => selectedShotIds.includes(s.id));
    if (selected.length === 0) return;
    const text = selected.map(s => `${s.title}\n${s.prompt}`).join('\n\n');
    navigator.clipboard.writeText(text);
    showToast(`📋 已复制 ${selected.length} 组提示词到剪贴板！`);
  };

  // 单张去生图
  const handleSingleGenerate = (shot: ParsedShotItem) => {
    const cleanRefImages = (shot.refImages && shot.refImages.length > 0)
      ? shot.refImages.map(normalizeImageUrlToStandardJpg).filter(Boolean)
      : (shot.refImage ? [normalizeImageUrlToStandardJpg(shot.refImage)] : []);

    let finalPrompt = shot.prompt.trim();
    if (cleanRefImages.length >= 2) {
      finalPrompt = finalPrompt
        .replace(/\{\{\s*(?:Mixed|Image|图)?\s*1\s*\}\}/gi, '@图片1')
        .replace(/\{\{\s*(?:Mixed|Image|图)?\s*2\s*\}\}/gi, '@图片2')
        .replace(/\{\{\s*(?:Mixed|Image|图)?\s*3\s*\}\}/gi, '@图片3');
    }

    const cleanedPrompt = stripWorkshopPromptGuards(cleanPromptText(finalPrompt));

    const task: GenerationTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: shot.title || 'AI分镜生成',
      prompt: cleanedPrompt,
      model: currentModelId,
      size: shot.aspectRatio || '3:4',
      quality: currentQuality,
      referenceImageUrl: cleanRefImages[0] || undefined,
      referenceImages: cleanRefImages.length > 0 ? cleanRefImages : undefined,
      images: cleanRefImages.length > 0 ? cleanRefImages : undefined,
      useReferenceImage: cleanRefImages.length > 0,
      createdAt: Date.now(),
      status: 'IN_PROGRESS',
      progress: '15%'
    };

    addBatchHubGenerations([task]);
    setCurrentView('generate');
    onClose();
    if (onGenerateSuccess) onGenerateSuccess();
  };

  // 一键并发批量启动全部已勾选任务 (完整携带多图 referenceImages 数组与人物一致性)
  const handleBatchStartGenerate = () => {
    if (availableImageModels.length === 0) {
      showToast('请先在设置中从网关拉取生图模型');
      return;
    }

    const selected = shots.filter(s => selectedShotIds.includes(s.id));
    if (selected.length === 0) {
      showToast('请先勾选至少 1 组提示词');
      return;
    }

    setIsGenerating(true);

    const unifiedBatchId = `batch-multishot-${Date.now()}`;
    const unifiedCreatedAt = Date.now();

    const tasksToCreate: GenerationTask[] = selected.map((shot, idx) => {
      const cleanRefImages = (shot.refImages && shot.refImages.length > 0)
        ? shot.refImages.map(normalizeImageUrlToStandardJpg).filter(Boolean)
        : (shot.refImage ? [normalizeImageUrlToStandardJpg(shot.refImage)] : []);

      let finalPrompt = shot.prompt.trim();
      if (cleanRefImages.length >= 2) {
        finalPrompt = finalPrompt
          .replace(/\{\{\s*(?:Mixed|Image|图)?\s*1\s*\}\}/gi, '@图片1')
          .replace(/\{\{\s*(?:Mixed|Image|图)?\s*2\s*\}\}/gi, '@图片2')
          .replace(/\{\{\s*(?:Mixed|Image|图)?\s*3\s*\}\}/gi, '@图片3');
      }

      const cleanedPrompt = stripWorkshopPromptGuards(cleanPromptText(finalPrompt));

      return {
        id: `task-${unifiedCreatedAt}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        batchId: unifiedBatchId,
        shotNo: idx + 1,
        title: shot.title || `第 ${idx + 1} 张分镜`,
        prompt: cleanedPrompt,
        model: currentModelId,
        size: shot.aspectRatio || '3:4',
        quality: currentQuality,
        referenceImageUrl: cleanRefImages[0] || undefined,
        referenceImages: cleanRefImages.length > 0 ? cleanRefImages : undefined,
        images: cleanRefImages.length > 0 ? cleanRefImages : undefined,
        useReferenceImage: cleanRefImages.length > 0,
        createdAt: unifiedCreatedAt + idx,
        status: 'IN_PROGRESS',
        progress: '15%'
      };
    });

    addBatchHubGenerations(tasksToCreate);
    setIsGenerating(false);
    setCurrentView('generate');
    onClose();
    if (onGenerateSuccess) onGenerateSuccess();
  };

  // 导入到 4 步买家秀 / 种草工坊
  const handleImportToBuyerShow = () => {
    const selected = shots.filter(s => selectedShotIds.includes(s.id));
    if (selected.length === 0) {
      showToast('请先勾选至少 1 组提示词');
      return;
    }

    // 1. 将选中的分镜格式化为买家秀工坊标准的 ShotPrompt 列表
    const formattedPrompts = selected.map((s, idx) => {
      const cleanRefs = (s.refImages && s.refImages.length > 0 ? s.refImages : (s.refImage ? [s.refImage] : []))
        .map(url => normalizeImageUrlToStandardJpg(url))
        .filter(Boolean);

      return {
        shot_no: idx + 1,
        title: s.title || `第 ${idx + 1} 张分镜`,
        angle: s.title || `分镜 ${idx + 1}`,
        prompt: s.prompt,
        productImageUrl: cleanRefs[0] || undefined,
        selected: true
      };
    });

    // 2. 若当前无商品数据，自动补充基础信息和可用参考图
    const allCleanRefs = availableImages.map(img => normalizeImageUrlToStandardJpg(img.url)).filter(Boolean);
    if (!product?.title || product.title.trim() === '') {
      setProductData(
        {
          title: 'AI 助手精选商品',
          price: '99.00',
          category: '种草/商业视觉',
          skuId: `SKU_${Date.now().toString(36).toUpperCase()}`
        },
        {
          main: allCleanRefs.slice(0, 5),
          skus: [],
          details: allCleanRefs.slice(5)
        }
      );
    }

    // 3. 内存直接注入 Zustand store（彻底避免 localStorage 5MB 配额溢出）
    setGeneratedPrompts(
      formattedPrompts,
      formattedPrompts.map(p => `${p.title}: ${p.prompt.slice(0, 50)}...`).join(' | ')
    );

    // 4. 跳转至「商业买家秀/种草工坊」并直达 Step 2（视觉分析与提示词工作台）
    setStep(2);
    setCurrentView('buyer_show');
    setIsAssistantOpen(false);
    onClose();
    if (onGenerateSuccess) onGenerateSuccess();
  };

  // 扩展为 6 张全套分镜 (如果当前不足 6 张)
  const handleExpandTo6Shots = () => {
    const defaultRefs = availableImages.slice(0, 2).map(img => normalizeImageUrlToStandardJpg(img.url)).filter(Boolean);
    const full6Shots: ParsedShotItem[] = [
      {
        id: `shot_6_1_${Date.now()}`,
        title: '📸 第1张: 主商品全景/正前方 C 位主视觉',
        prompt: `Hero product photography shot of @图片1 floating gracefully with model @图片2 in pure clean studio setting, ultra realistic, elegant soft shadows, 8k resolution, minimalist luxury aesthetic --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_2_${Date.now()}`,
        title: '📸 第2张: 45° 俯瞰动态光影空间构图',
        prompt: `High-angle 45 degree dynamic commercial photography, product @图片1 held naturally by model @图片2 on sleek minimalist surface with soft warm sun ray reflections and architectural light beams, crisp texture, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_3_${Date.now()}`,
        title: '📸 第3张: 极致微距材质细节/核心特写',
        prompt: `Macro close-up shot focusing on premium material texture of @图片1 with model @图片2 in background, shallow depth of field, delicate studio rim lighting, luxury advertising grade, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_4_${Date.now()}`,
        title: '📸 第4张: 屏幕/功能界面点亮交互展示',
        prompt: `Front interactive view of product @图片1 used by model @图片2 with bright vibrant borderless display UI, crisp flat screen edge, modern workstation desk setup, natural daylight ambiance, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_5_${Date.now()}`,
        title: '📸 第5张: 生活化随身使用/超薄机身侧影',
        prompt: `Minimalist lifestyle commercial shot, model @图片2 holding slim edge profile of @图片1 floating above a textured stone block, subtle rim light, elegant high-end tech vibe, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      },
      {
        id: `shot_6_6_${Date.now()}`,
        title: '📸 第6张: 场景化模特手持穿搭合影 (总结种草)',
        prompt: `Creative portrait photography, model @图片2 wearing stylish casual outfit smiling naturally and showcasing product @图片1, aesthetic urban cafe background, dynamic soft daylight lighting, 8k --ar 3:4 --style raw --v 6.0`,
        aspectRatio: '3:4',
        refImages: defaultRefs,
        refImage: defaultRefs[0]
      }
    ];

    setShots(full6Shots);
    setSelectedShotIds(full6Shots.map(s => s.id));
    showToast('🎉 已成功自动扩充为 6 张全套分镜大片！');
  };

  // 手动添加一个新分镜
  const handleAddShot = () => {
    const newIdx = shots.length + 1;
    const defaultRefs = availableImages.slice(0, 2).map(img => normalizeImageUrlToStandardJpg(img.url)).filter(Boolean);
    const newShot: ParsedShotItem = {
      id: `shot_manual_${Date.now()}`,
      title: `📸 第${newIdx}张: 新增分镜`,
      prompt: `商业广告产品实拍图，高清晰度，摄影棚柔光，8k --ar 3:4 --style raw --v 6.0`,
      aspectRatio: '3:4',
      refImages: defaultRefs,
      refImage: defaultRefs[0]
    };
    setShots(prev => [...prev, newShot]);
    setSelectedShotIds(prev => [...prev, newShot.id]);
    showToast(`➕ 已添加第 ${newIdx} 个新分镜`);
  };

  // 删除单张分镜
  const handleDeleteShot = (id: string) => {
    if (shots.length <= 1) {
      showToast('至少保留 1 个分镜');
      return;
    }
    setShots(prev => prev.filter(s => s.id !== id));
    setSelectedShotIds(prev => prev.filter(i => i !== id));
  };

  return (
    <div className="fixed inset-0 z-60 pointer-events-auto flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-3 sm:p-5 animate-fade-in select-none">
      <div 
        className="w-full max-w-5xl bg-white border border-slate-200/90 rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-800 relative pointer-events-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 1. 顶部 Header */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-100 bg-white flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                批量生图工作台
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-mono font-bold">
                {shots.length} 组分镜
              </span>
              {availableImages.length >= 2 && (
                <span className="px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 text-[11px] font-medium">
                  支持双图人物一致性
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              可编辑提示词与画幅；垫图支持图1商品 + 图2人物
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
            title="关闭弹窗"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2a. 模型 · 画质 · 统一画幅 */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowModelMenu(!showModelMenu);
                  setShowQualityMenu(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-2 transition-all cursor-pointer"
                title="点击选择生图模型引擎"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {getModelIcon(currentModelId, 'w-4 h-4')}
                </div>
                <span>{currentModelConfig.name}</span>
                {currentModelConfig.badge && (
                  <span className="px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-mono font-semibold">
                    {currentModelConfig.badge}
                  </span>
                )}
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showModelMenu && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl border border-slate-200/90 shadow-2xl p-1.5 z-50 space-y-1 animate-fade-in">
                  <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    选择出图模型引擎
                  </div>
                  {availableImageModels.map((m: any) => {
                    const isSelected = m.id === currentModelId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectModel(m.id)}
                        className={`w-full p-2.5 rounded-xl text-left transition-all flex items-start justify-between gap-2 cursor-pointer ${
                          isSelected 
                            ? 'bg-red-50/80 text-red-700 border border-red-200/80' 
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="w-5 h-5 flex-shrink-0 mt-0.5">
                            {getModelIcon(m.id, 'w-5 h-5')}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold">{m.name}</span>
                              {m.badge && (
                                <span className="px-1 py-0.2 rounded text-[9px] bg-red-100 text-red-600 font-bold">
                                  {m.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                              {m.description || `${m.provider || 'AI'} 官方旗舰商拍引擎`}
                            </p>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowQualityMenu(!showQualityMenu);
                  setShowModelMenu(false);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                title="选择生成画质等级"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>
                  {currentQuality === 'high' ? '4K 超清' : currentQuality === 'medium' ? '标准' : '极速'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showQualityMenu && (
                <div className="absolute top-full left-0 mt-2 w-44 bg-white rounded-2xl border border-slate-200 shadow-2xl p-1.5 z-50 space-y-0.5 animate-fade-in text-xs">
                  <button
                    type="button"
                    onClick={() => handleSelectQuality('high')}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between cursor-pointer ${
                      currentQuality === 'high' ? 'bg-red-50 text-red-600 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>4K 超清画质</span>
                    {currentQuality === 'high' && <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectQuality('medium')}
                    className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between cursor-pointer ${
                      currentQuality === 'medium' ? 'bg-red-50 text-red-600 font-bold' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>标准均衡画质</span>
                    {currentQuality === 'medium' && <Check className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>

            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-400 px-2 font-medium">统一画幅</span>
              {COMMON_RATIOS.map(ratio => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => handleApplyGlobalRatio(ratio)}
                  className="px-2 py-1 rounded-lg text-[11px] font-mono text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all cursor-pointer"
                  title={`将所有勾选的分镜比例设为 ${ratio}`}
                >
                  {ratio}
                </button>
              ))}
            </div>
        </div>

        {/* 2b. 次要批量操作 */}
        <div className="px-5 sm:px-6 py-2 border-b border-slate-100 bg-white flex flex-wrap items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 border border-slate-200"
            >
              <CheckCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>{selectedShotIds.length === shots.length ? '取消全选' : '全部勾选'}</span>
            </button>

            {availableImages.length >= 2 && (
              <button
                type="button"
                onClick={handleApplyImg1AndImg2ToAll}
                className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                title="将所有分镜同时绑定图1+图2"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>垫图1+图2</span>
              </button>
            )}

            {availableImages.length > 0 && (
              <button
                type="button"
                onClick={handleApplyImg1ToAll}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1"
                title="统一垫图1"
              >
                <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>垫图1</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClearAllRefImages}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1"
              title="清空垫图"
            >
              <Ban className="w-3.5 h-3.5 text-slate-400" />
              <span>清空垫图</span>
            </button>

            <button
              type="button"
              onClick={handleExpandTo6Shots}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1"
              title="扩充为 6 张"
            >
              <Wand2 className="w-3.5 h-3.5 text-slate-500" />
              <span>扩充 6 张</span>
            </button>

            <button
              type="button"
              onClick={handleAddShot}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>加分镜</span>
            </button>

            <button
              type="button"
              onClick={handleCopyAllPrompts}
              className="p-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 transition-colors cursor-pointer ml-auto"
              title="复制所有已选分镜提示词"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
        </div>

        {/* 3. 分镜卡片列表 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 min-h-0 scrollbar-thin bg-slate-50/50">
          <div className="space-y-3">
            {shots.map((shot, idx) => {
              const isSelected = selectedShotIds.includes(shot.id);
              const shotIndexStr = String(idx + 1).padStart(2, '0');
              const activeRefImages = (shot.refImages && shot.refImages.length > 0)
                ? shot.refImages
                : (shot.refImage ? [shot.refImage] : []);

              return (
                <div
                  key={shot.id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    isSelected 
                      ? 'bg-white border-slate-200 shadow-sm' 
                      : 'bg-white/70 border-slate-200/80 opacity-75 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleSelect(shot.id)}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
                          isSelected 
                            ? 'bg-red-600 border-red-600 text-white' 
                            : 'border-slate-300 hover:border-slate-400 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                      <div className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[11px] font-bold">
                        分镜 {shotIndexStr}
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {shot.title || `第 ${idx + 1} 张分镜`}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSingleGenerate(shot)}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-red-50 text-red-600 border border-red-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                        title={`使用 [${currentModelConfig.shortName}] 生成此分镜`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>单张生图</span>
                      </button>
                      {shots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteShot(shot.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="删除此分镜"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <textarea
                      value={shot.prompt}
                      onChange={e => handleUpdatePrompt(shot.id, e.target.value)}
                      rows={4}
                      className="w-full p-3 rounded-xl bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 text-xs text-slate-800 focus:border-red-400 focus:ring-2 focus:ring-red-100 focus:outline-none resize-y min-h-[88px] font-mono leading-relaxed transition-all"
                      placeholder="输入生图提示词..."
                    />
                    <div className="absolute right-2.5 bottom-2 text-[10px] text-slate-400 font-mono pointer-events-none">
                      {shot.prompt.length} 字符
                    </div>
                  </div>

                  {/* 垫图一行 */}
                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500">
                      <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mr-0.5">
                        <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>垫图</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => handleClearShotRefImages(shot.id)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                          activeRefImages.length === 0 
                            ? 'bg-slate-900 text-white font-bold border-slate-900' 
                            : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
                        }`}
                      >
                        无
                      </button>

                      {availableImages.map((img, imgIdx) => {
                        const cleanImgUrl = normalizeImageUrlToStandardJpg(img.url);
                        const isRef = activeRefImages.includes(cleanImgUrl);
                        const refOrderIndex = activeRefImages.indexOf(cleanImgUrl);

                        return (
                          <button
                            key={imgIdx}
                            type="button"
                            onClick={() => handleToggleShotRefImage(shot.id, cleanImgUrl)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] transition-all cursor-pointer border ${
                              isRef 
                                ? 'bg-red-50 text-red-700 border-red-300 font-bold' 
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                            title={`切换 @图片${refOrderIndex >= 0 ? refOrderIndex + 1 : imgIdx + 1}`}
                          >
                            <div className="relative w-4 h-4 rounded overflow-hidden flex-shrink-0 bg-slate-100">
                              <img 
                                src={cleanImgUrl} 
                                alt="" 
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  const target = e.currentTarget;
                                  if (!target.dataset.hasRetried && cleanImgUrl) {
                                    target.dataset.hasRetried = 'true';
                                    target.src = proxyMediaUrl(cleanImgUrl);
                                  }
                                }}
                                className="w-full h-full object-cover" 
                              />
                            </div>
                            <span>{img.label || `图${imgIdx + 1}`}</span>
                            {isRef && refOrderIndex >= 0 && (
                              <span className="px-1 rounded bg-red-600 text-white text-[9px] font-mono font-black">
                                @{refOrderIndex + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {availableImages.length >= 2 && activeRefImages.length !== 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const dualUrls = [
                              normalizeImageUrlToStandardJpg(availableImages[0].url),
                              normalizeImageUrlToStandardJpg(availableImages[1].url)
                            ].filter(Boolean);
                            setShots(prev => prev.map(s => s.id === shot.id ? { ...s, refImages: dualUrls, refImage: dualUrls[0] } : s));
                          }}
                          className="px-2 py-1 rounded-lg text-[10px] font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all cursor-pointer flex items-center gap-1"
                          title="一键双图"
                        >
                          <UserCheck className="w-3 h-3" />
                          <span>双图</span>
                        </button>
                      )}
                  </div>

                  {/* 画幅单独一行 */}
                  <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-medium">画幅</span>
                      {COMMON_RATIOS.map(ratio => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => handleUpdateAspectRatio(shot.id, ratio)}
                          className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer border ${
                            shot.aspectRatio === ratio 
                              ? 'bg-red-600 border-red-600 text-white font-bold' 
                              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {ratio}
                        </button>
                      ))}
                  </div>

                  {activeRefImages.length >= 2 && (
                    <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                      <span>多图协同：@图片1 与 @图片2 将一并送入生图</span>
                      <div className="flex items-center gap-1.5">
                        {activeRefImages.map((u, i) => (
                          <img 
                            key={i} 
                            src={u} 
                            alt="" 
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const target = e.currentTarget;
                              if (!target.dataset.hasRetried && u) {
                                target.dataset.hasRetried = 'true';
                                target.src = proxyMediaUrl(u);
                              }
                            }}
                            className="w-5 h-5 rounded-md object-cover border border-slate-200" 
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 4. 底栏 */}
        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between flex-shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>已勾选 <strong className="text-slate-900 font-mono text-sm">{selectedShotIds.length}</strong> / {shots.length}</span>
            <span className="text-slate-300">·</span>
            <span>引擎 <strong className="text-slate-800 font-bold">{currentModelConfig.shortName}</strong></span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleImportToBuyerShow}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-2 cursor-pointer transition-all"
            >
              <Layers className="w-4 h-4 text-slate-500" />
              <span>导入买家秀工坊</span>
            </button>

            <button
              type="button"
              onClick={handleBatchStartGenerate}
              disabled={isGenerating || selectedShotIds.length === 0 || availableImageModels.length === 0}
              className="px-6 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>批量开始 ({selectedShotIds.length})</span>
            </button>
          </div>
        </div>
      </div>

      {toastMsg && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-70 px-4 py-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold shadow-2xl animate-fade-in flex items-center gap-2 border border-white/10">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
