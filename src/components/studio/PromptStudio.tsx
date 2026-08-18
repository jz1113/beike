'use client';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { STYLE_PRESETS, getMergedStylePresets, VISION_MODELS, ShotPrompt, getMergedCategories } from '@/lib/vision';
import { getModelIcon } from '@/components/common/ModelIcons';
import { getModelProviderName } from '@/components/hub/PromptActionBar';
import { 
  Sparkles, 
  Loader2, 
  ArrowLeft, 
  Copy, 
  Check, 
  Trash2, 
  Plus, 
  Wand2, 
  Sliders, 
  Layers, 
  Cpu, 
  Eye, 
  CheckCircle2,
  Edit3,
  Lightbulb,
  ArrowRight,
  Info,
  BookOpen,
  Settings,
  RotateCw,
  FolderSearch,
  ScanEye,
  ChevronDown,
  Camera,
  Film
} from 'lucide-react';

import StyleExtractModal from '@/components/modals/StyleExtractModal';
import CategoryManagerModal from '@/components/modals/CategoryManagerModal';
import RecipeBrowserModal from '@/components/modals/RecipeBrowserModal';
import { recordModelUsage } from '@/lib/usageTracker';
import { cleanPromptText } from '@/lib/drawing';

interface Props {
  onBackToStep1: () => void;
  onNextToStep3: () => void;
  onOpenPromptHistory?: () => void;
  onOpenSettings?: () => void;
}

export default function PromptStudio({ 
  onBackToStep1, 
  onNextToStep3,
  onOpenPromptHistory,
  onOpenSettings
}: Props) {
  const {
    product,
    images,
    currentStep,
    setStep,
    selectedVisionModel,
    setSelectedVisionModel,
    selectedStyleId,
    setSelectedStyleId,
    shotCount,
    setShotCount,
    extraRequirements,
    setExtraRequirements,
    isAnalyzing,
    setIsAnalyzing,
    productFingerprint,
    generatedPrompts,
    setGeneratedPrompts,
    updateShotPrompt,
    toggleShotSelection,
    addShotPrompt,
    deleteShotPrompt,
    workshopMode,
    clonedSocialImages,
    modelPersona,
    setModelPersona,
    anchorFaceImageUrl,
    setAnchorFaceImageUrl,
    isAnchorFaceConfirmed,
    setIsAnchorFaceConfirmed,
    initGenerationTasks
  } = useAppStore();

  const isNoModel = !modelPersona || modelPersona === 'none' || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物');

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [customStyleText, setCustomStyleText] = useState('');
  const [isViewingStyleSnippet, setIsViewingStyleSnippet] = useState(false);
  const [isEditingStyleSnippet, setIsEditingStyleSnippet] = useState(false);
  const [copiedStyleSnippet, setCopiedStyleSnippet] = useState(false);
  const [customFingerprint, setCustomFingerprint] = useState('');
  const [isEditingFingerprint, setIsEditingFingerprint] = useState(false);

  // 全局提示词批量查找替换状态
  const [showBatchReplace, setShowBatchReplace] = useState(false);
  const [findKeyword, setFindKeyword] = useState('');
  const [replaceKeyword, setReplaceKeyword] = useState('');

  // 自定义配方与逆向弹窗状态
  const [customRecipes, setCustomRecipes] = useState<any[]>([]);
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);
  const [isRecipeBrowserOpen, setIsRecipeBrowserOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoryTab, setCategoryTab] = useState<string>('all');
  // 多模态大模型列表（统一 Comfly 的 isMultimodal || isVision 字段，排除纯生图/生视频模型）
  const [availableVisionModels, setAvailableVisionModels] = useState<any[]>(VISION_MODELS);
  const [availableCategories, setAvailableCategories] = useState<any[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部收起模型下拉浮层
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 加载自定义/拉取的多模态模型列表 — 统一走 isMultimodal || isVision || (!isImage && !isVideo) 过滤，与 SettingsModal 保持一致
  const loadMultimodalModels = () => {
    setAvailableCategories(getMergedCategories());
    let modelsList = VISION_MODELS;
    const savedCustom = typeof window !== 'undefined' ? localStorage.getItem('custom_models') : null;
    if (savedCustom) {
      try {
        const parsed = JSON.parse(savedCustom);
        // 统一字段：isMultimodal（新）或 isVision（旧），且不是纯生图/生视频
        const multimodalModels = parsed.filter((m: any) =>
          m.isMultimodal || m.isVision || (!m.isImage && !m.isVideo)
        ).map((m: any) => ({
          id: m.id,
          name: m.name || m.id,
          shortName: m.shortName || (m.name || m.id).split(' ')[0],
          provider: m.provider || '多模态',
          isMultimodal: !!(m.isMultimodal || m.isVision)
        }));
        if (multimodalModels.length > 0) {
          modelsList = multimodalModels;
          setAvailableVisionModels(multimodalModels);
        }
      } catch (e) {}
    }

    // 🌟 严格同步：从 localStorage 获取当前全局选定的多模态模型
    const savedModel = typeof window !== 'undefined' ? (localStorage.getItem('ai_multimodal_model') || localStorage.getItem('ai_vision_model')) : null;
    const currentModelId = selectedVisionModel || savedModel;
    const matched = modelsList.find((m: any) => m.id === currentModelId) || modelsList.find((m: any) => m.id === savedModel) || modelsList[0];
    if (matched && matched.id !== selectedVisionModel) {
      setSelectedVisionModel(matched.id);
      if (typeof window !== 'undefined') {
        localStorage.setItem('ai_multimodal_model', matched.id);
        localStorage.setItem('ai_vision_model', matched.id);
      }
    }
  };

  useEffect(() => {
    loadMultimodalModels();
    window.addEventListener('models_updated', loadMultimodalModels);
    return () => window.removeEventListener('models_updated', loadMultimodalModels);
  }, []);

  // 获取用户保存的自定义配方库
  const fetchRecipes = async () => {
    try {
      const res = await fetch('/api/styles');
      const data = await res.json();
      if (data.success) {
        setCustomRecipes(data.recipes || []);
      }
    } catch (e) {
      console.warn('获取配方库失败:', e);
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  // 自动清洗历史或新生成中可能残留的 JSON 字段结构，确保永远只呈现纯净提示词
  useEffect(() => {
    if (generatedPrompts && generatedPrompts.length > 0) {
      const needsCleaning = generatedPrompts.some(p => 
        p.prompt && (
          p.prompt.includes('"product_fingerprint"') || 
          p.prompt.includes('"prompt"') || 
          p.prompt.includes('"scene"') || 
          p.prompt.includes('"title"') ||
          p.prompt.startsWith('{') || 
          p.prompt.startsWith('```json')
        )
      );
      if (needsCleaning) {
        const cleaned = generatedPrompts.map(p => ({
          ...p,
          prompt: cleanPromptText(p.prompt)
        }));
        setGeneratedPrompts(cleaned, productFingerprint);
      }
    }
  }, [generatedPrompts, productFingerprint, setGeneratedPrompts]);

  // 爆款复刻模式下，强制自动同步 shotCount 为已勾选的爆款参考图数量 (1:1 严格对齐)
  const selectedClonedList = clonedSocialImages.filter(i => i.selected);
  const selectedClonedCount = selectedClonedList.length;
  const effectiveShotCount = workshopMode === 'social_face_product_swap' && selectedClonedCount > 0 
    ? selectedClonedCount 
    : shotCount;

  useEffect(() => {
    if (workshopMode === 'social_face_product_swap') {
      const count = clonedSocialImages.filter(i => i.selected).length;
      if (count > 0 && shotCount !== count) {
        setShotCount(count);
      }
    }
  }, [workshopMode, clonedSocialImages, shotCount, setShotCount]);

  // 选中的用于视觉识别的素材图
  const selectedImages = images.filter(img => img.selected);
  const effectiveImages = selectedImages.length > 0 ? selectedImages : images.slice(0, 4);

  // 发起视觉分析与提示词生成
  const handleGeneratePrompts = async () => {
    if (!product && effectiveImages.length === 0) {
      alert('请先选择商品素材图');
      return;
    }

    setIsAnalyzing(true);
    try {
      // 查找是否为系统预设或自定义配方
      const allPresets = getMergedStylePresets();
      const activeSystemStyle = allPresets.find(s => s.id === selectedStyleId) || STYLE_PRESETS.find(s => s.id === selectedStyleId);
      const activeCustomRecipe = customRecipes.find(r => r.id === selectedStyleId);

      let styleDesc = '';
      if (customStyleText?.trim()) {
        styleDesc = customStyleText.trim();
      } else if (activeCustomRecipe) {
        const arch = activeCustomRecipe.architecture;
        styleDesc = `【自定义专属提示词生成元架构 - ${activeCustomRecipe.name}】: ${activeCustomRecipe.promptSnippet}` +
          (arch ? `\n- 角色与定位: ${arch.role_definition || ''}\n- 空间置景法则: ${arch.spatial || ''}\n- 多光源光影系统: ${arch.lighting || ''}\n- 开放式道具生态: ${arch.props || ''}\n- 画中画壁纸/材质光泽: ${arch.screen || ''}\n- 镜头与去AI质感: ${arch.optics || ''}` : '');
      } else if (activeSystemStyle) {
        styleDesc = `${activeSystemStyle.name}: ${activeSystemStyle.promptSnippet}`;
      } else if (extraRequirements?.trim()) {
        styleDesc = `【用户指定场景要求】：${extraRequirements.trim()}`;
      } else {
        styleDesc = '【智能自由创作模式】：AI 视觉大模型依据商品实物图与品类特性，自主策划真实生活空间、高审美道具与自然光影。';
      }

      const { workshopMode, clonedSocialImages, modelPersona, anchorFaceImageUrl } = useAppStore.getState();
      const selectedClonedUrls = clonedSocialImages.filter(i => i.selected).map(i => i.url);
      const effectiveShotCount = workshopMode === 'social_face_product_swap' && selectedClonedUrls.length > 0 
        ? selectedClonedUrls.length 
        : shotCount;

      const activeVisionModel = availableVisionModels.find(m => m.id === selectedVisionModel) || availableVisionModels[0] || VISION_MODELS[0];
      const targetVisionModel = activeVisionModel?.id || selectedVisionModel || 'gpt-5.6-luna';
      const localUrl = typeof window !== 'undefined' ? localStorage.getItem('ai_base_url') || undefined : undefined;
      const localKey = typeof window !== 'undefined' ? localStorage.getItem('ai_api_key') || undefined : undefined;

      const isSocialMode = workshopMode === 'social_face_product_swap';
      const targetSingleProductImg = product?.picUrl || effectiveImages[0]?.url;
      const targetProductImageUrls = isSocialMode
        ? (targetSingleProductImg ? [targetSingleProductImg] : [])
        : effectiveImages.map(img => img.url);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: workshopMode,
          productTitle: product?.title || '优质电商商品',
          imageUrls: targetProductImageUrls,
          referenceImageUrls: selectedClonedUrls,
          anchorFaceImageUrl: anchorFaceImageUrl || undefined,
          modelPersona: anchorFaceImageUrl ? '已绑定专属真人模特正脸图（100% 真实面容克隆）' : modelPersona,
          templateStyle: styleDesc,
          shotCount: effectiveShotCount,
          extraRequirements: extraRequirements,
          model: targetVisionModel,
          customBaseUrl: localUrl,
          customApiKey: localKey
        })
      });

      const data = await res.json();

      const cleanedPrompts = (data.prompts || []).map((p: any, idx: number) => {
        // 🌟 严格 1 对 1 分配用户勾选的多张底图：
        // 爆款复刻模式下统一绑定目标商品的纯净主图；原创模式下按分镜轮转分配
        const assignedImgUrl = isSocialMode
          ? (targetSingleProductImg || effectiveImages[0]?.url)
          : (effectiveImages[idx % effectiveImages.length]?.url || effectiveImages[0]?.url);

        return {
          ...p,
          productImageUrl: p.productImageUrl || assignedImgUrl,
          prompt: cleanPromptText(p.prompt || p.description || (typeof p === 'string' ? p : ''))
        };
      });

      setGeneratedPrompts(cleanedPrompts, data.productFingerprint);

      // 🌟 记录真实视觉大模型调用用量
      const actualModel = data.modelUsed || selectedVisionModel;
      const modelObj = VISION_MODELS.find(m => m.id === actualModel);
      const estPromptTokens = (effectiveImages.length * 258) + 800;
      const estCompletionTokens = (data.prompts?.length || shotCount) * 180;
      recordModelUsage({
        modelId: actualModel,
        modelName: modelObj?.name || actualModel,
        provider: modelObj?.provider || (actualModel.includes('grok') ? 'xAI' : actualModel.includes('gpt') ? 'OpenAI' : 'Google'),
        type: 'vision',
        promptTokens: estPromptTokens,
        completionTokens: estCompletionTokens,
        totalTokens: estPromptTokens + estCompletionTokens,
        mediaCount: 0,
        success: true
      });
    } catch (e: any) {
      alert(e.message || '视觉大模型分析超时，请重试');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = () => {
    const allText = generatedPrompts
      .map((p, idx) => `【分镜 ${p.shot_no || idx + 1} - ${p.title}】\n${p.prompt}`)
      .join('\n\n');
    navigator.clipboard.writeText(allText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleSaveFingerprint = () => {
    useAppStore.setState({ productFingerprint: customFingerprint });
    setIsEditingFingerprint(false);
  };

  // 🌟 单分镜独立换个视角/重抽机位
  const handleRerollSingleShot = (index: number) => {
    const current = generatedPrompts[index];
    if (!current) return;
    const shotOptions = [
      '45度低角度斜侧透视，阳光穿透窗棂形成柔和斑驳光栅，强调商品立体倒角轮廓与细节质感',
      '第一人称俯视视角，沉浸式操作使用状态，手指自然抚过商品边缘，体现人与商品的亲密互动',
      '微距浅景深特写，背景极度柔化光斑，焦点精准锁定在商品的工艺接缝与材质涂层上，质感拉满',
      '平视生活化生活桌面摆放，随手搁置的自然余温感，旁边点缀生活化小物件，不经意间流露松弛高级感',
      '大景深空间穿透透视，商品置于中景核心黄金分割点，周围环境与自然光线相互辉映'
    ];
    const pickedOption = shotOptions[Math.floor(Math.random() * shotOptions.length)];
    const basePrompt = current.prompt.replace(/，(?:45度|第一人称|微距|平视|大景深)[^，。\n]*/g, '');
    const newPrompt = `${basePrompt}，构图视角升级为【${pickedOption}】。`;
    updateShotPrompt(index, { prompt: newPrompt });
  };

  // 🌟 单分镜智能画质与光影润色
  const handlePolishSingleShot = (index: number) => {
    const current = generatedPrompts[index];
    if (!current) return;
    if (current.prompt.includes('哈苏自然色彩科学') || current.prompt.includes('真实物理漫反射光影')) {
      alert('该分镜已具备高级光影质感润色');
      return;
    }
    const polishText = '，8K极清画质，哈苏自然色彩科学(HNCS)，逼真微距景深虚化，真实物理漫反射光影，细腻空气微粒质感，无任何过曝与死黑。';
    updateShotPrompt(index, { prompt: `${current.prompt.trim()}${polishText}` });
  };

  const selectedPromptCount = generatedPrompts.filter(p => p.selected !== false).length;

  return (
    <div className="flex-1 flex overflow-hidden bg-[#F8F9FC] text-slate-900 select-none">
      {/* Left Sidebar: Vision Parameters Workbench (Enhanced Breathing Room & Luxury Light Theme) */}
      <div className="w-[360px] md:w-[400px] lg:w-[420px] xl:w-[450px] 2xl:w-[480px] flex-shrink-0 bg-white border-r border-slate-200/80 flex flex-col h-full shadow-[2px_0_12px_rgba(0,0,0,0.03)] z-10">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between flex-shrink-0 bg-white">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBackToStep1}
              className="p-2 rounded-xl bg-slate-100/90 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer shadow-2xs"
              title="返回素材采编"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span>视觉多模态策划</span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">Step 2</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-medium">配置大模型与配方，精准规划分镜</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenPromptHistory && (
              <button
                onClick={onOpenPromptHistory}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-indigo-100 shadow-2xs"
                title="查看提示词库"
              >
                <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                <span>提示词库</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Compact Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4.5">
          {/* 1. Reference Assets Bar */}
          {workshopMode === 'social_face_product_swap' ? (
            <div className="p-4 rounded-3xl bg-gradient-to-br from-pink-50/90 via-rose-50/40 to-purple-50/60 border border-pink-200/90 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-pink-950">
                <span className="flex items-center gap-1.5 text-pink-800">
                  <Sparkles className="w-4 h-4 text-pink-600" />
                  <span>爆款复刻资产基准</span>
                </span>
                <button
                  onClick={onBackToStep1}
                  className="px-2.5 py-1 rounded-xl bg-white/90 hover:bg-white text-[11px] text-pink-700 hover:text-pink-900 border border-pink-200 font-bold transition-all cursor-pointer shadow-2xs hover:scale-105"
                >
                  重选素材
                </button>
              </div>

              {/* 3合1 资产概览条 */}
              <div className="space-y-2">
                {/* 1. 社媒参考分镜 */}
                <div className="p-2.5 rounded-2xl bg-white/95 border border-pink-200/70 shadow-2xs space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                    <span>📸 社媒参考分镜 ({clonedSocialImages.filter(i => i.selected).length} 张)</span>
                    <span className="text-[10px] text-pink-600 font-mono font-bold">1:1 复刻构图</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto py-0.5 scrollbar-thin">
                    {selectedClonedList.map((img, idx) => {
                      const origIndex = clonedSocialImages.findIndex(i => i.url === img.url);
                      const displayNum = origIndex !== -1 ? origIndex + 1 : idx + 1;
                      return (
                        <div key={idx} className="relative flex-shrink-0 group/thumb">
                          <img
                            src={img.url}
                            alt=""
                            className="w-11 h-11 rounded-xl object-cover bg-white border border-pink-200 shadow-2xs"
                          />
                          <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded bg-black/70 backdrop-blur-md text-white text-[8px] font-bold font-mono">
                            #{displayNum}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. 待替换目标商品实物 */}
                <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/95 border border-pink-200/70 shadow-2xs">
                  <img
                    src={product?.picUrl || effectiveImages[0]?.url}
                    alt=""
                    className="w-10 h-10 rounded-xl object-cover bg-white border border-slate-200 shadow-2xs flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-slate-400">📦 待替换目标实物</div>
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {product?.title || '目标电商商品'}
                    </div>
                  </div>
                </div>

                {/* 3. 全局模特人设 / 纯商品模式 */}
                <div 
                  onClick={() => {
                    if (isNoModel) {
                      setModelPersona('🌸 亚洲清纯甜美女生 (自然裸妆 · 微表情灵动)');
                    } else {
                      setModelPersona('🚫 纯商品实物 (无需模特/无人脸)');
                    }
                  }}
                  className={`p-2.5 rounded-2xl bg-white/95 border transition-all cursor-pointer shadow-2xs flex items-center justify-between hover:shadow-xs ${
                    isNoModel 
                      ? 'border-slate-300/80 hover:border-slate-400' 
                      : (anchorFaceImageUrl ? 'border-purple-300 bg-purple-50/40 hover:border-purple-400' : 'border-pink-200/70 hover:border-pink-300')
                  }`}
                  title="点击切换模特/纯商品模式"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {anchorFaceImageUrl && !isNoModel ? (
                      <img 
                        src={anchorFaceImageUrl} 
                        alt="专属模特" 
                        className="w-8 h-8 rounded-full object-cover ring-2 ring-purple-300 flex-shrink-0 shadow-2xs" 
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-bold text-slate-400">
                        {isNoModel ? '📦 画面主体设定' : (anchorFaceImageUrl ? '👤 专属定制真人模特' : '👤 全局统一模特面容')}
                      </div>
                      <div className={`text-xs font-bold truncate ${isNoModel ? 'text-slate-700' : (anchorFaceImageUrl ? 'text-purple-950 font-extrabold' : 'text-pink-900')}`}>
                        {isNoModel 
                          ? '🚫 纯商品实物 (无需模特/无人脸)' 
                          : (anchorFaceImageUrl ? '✨ 已锁定专属正脸照' : (modelPersona || '🌸 亚洲清纯甜美女生'))}
                      </div>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex-shrink-0 flex items-center gap-1 ${
                    isNoModel 
                      ? 'bg-slate-100 text-slate-600' 
                      : (anchorFaceImageUrl ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-pink-100 text-pink-700')
                  }`}>
                    {isNoModel ? '纯商品' : (anchorFaceImageUrl ? '专属人脸' : '已锁定')}
                    <span className="text-[9px] text-slate-400 font-normal underline ml-0.5">切换</span>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-3xl bg-indigo-50/70 border border-indigo-100/90 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span className="flex items-center gap-2 text-indigo-950 font-bold">
                  <div className="w-5 h-5 rounded-lg bg-white border border-indigo-200 text-indigo-600 flex items-center justify-center shadow-2xs">
                    <Camera className="w-3 h-3" />
                  </div>
                  <span>参考商品底图 ({effectiveImages.length} 张)</span>
                </span>
                <button
                  onClick={onBackToStep1}
                  className="px-2 py-0.5 rounded-lg bg-white/80 hover:bg-white text-[11px] text-indigo-700 hover:text-indigo-900 border border-indigo-200/80 font-bold transition-all cursor-pointer shadow-2xs"
                >
                  重新勾选
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex -space-x-2 overflow-hidden py-0.5 flex-shrink-0">
                  {effectiveImages.slice(0, 5).map((img, idx) => (
                    <img
                      key={idx}
                      src={img.url}
                      alt=""
                      className="w-10 h-10 rounded-xl object-cover bg-white border-2 border-white shadow-xs flex-shrink-0"
                    />
                  ))}
                </div>
                {product && (
                  <div className="min-w-0 flex-1 pl-1 text-xs text-slate-700 truncate font-semibold">
                    {product.title}
                  </div>
                )}
              </div>
            </div>
          )}


          {/* 2. 多模态大模型选择器（统一 Comfly 三分类：生图 / 生视频 / 多模态；视觉分析与分镜策划均走多模态通道）*/}
          {(() => {
            const activeVisionModel = availableVisionModels.find(m => m.id === selectedVisionModel) || availableVisionModels[0] || VISION_MODELS[0];
            const activeProvider = getModelProviderName(activeVisionModel.id, activeVisionModel.name, activeVisionModel.provider);
            
            return (
              <div className="space-y-2 relative" ref={modelDropdownRef}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-lg bg-purple-50 border border-purple-200/80 text-purple-600 flex items-center justify-center shadow-2xs">
                      <Cpu className="w-3 h-3" />
                    </div>
                    <span>多模态大模型</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">视觉分析 · 分镜策划</span>
                </div>

                {/* 主选定模型胶囊卡片 (点击展开/收起完整模型列表) */}
                <button
                  type="button"
                  onClick={() => setIsModelDropdownOpen(prev => !prev)}
                  className="w-full p-2.5 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-300 hover:shadow-xs transition-all cursor-pointer flex items-center justify-between gap-2.5 text-left group shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-2xs">
                      {getModelIcon(activeVisionModel.id, "w-6 h-6")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {activeVisionModel.shortName || activeVisionModel.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 flex-shrink-0">
                          {activeProvider}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        多模态视觉推理 · 4K 分镜解构
                      </div>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isModelDropdownOpen ? 'rotate-180 text-indigo-600' : 'group-hover:text-slate-600'}`} />
                </button>

                {/* 下拉模型弹层 */}
                {isModelDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 z-50 p-2 rounded-2xl bg-white border border-slate-200 shadow-xl space-y-1.5 max-h-72 overflow-y-auto animate-fade-in">
                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 flex items-center justify-between border-b border-slate-100">
                      <span>切换多模态策划模型</span>
                      <span>共 {availableVisionModels.length} 个模型</span>
                    </div>
                    <div className="space-y-1">
                      {availableVisionModels.map(m => {
                        const isSelected = selectedVisionModel === m.id;
                        const provider = getModelProviderName(m.id, m.name, m.provider);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSelectedVisionModel(m.id);
                              if (typeof window !== 'undefined') {
                                localStorage.setItem('ai_multimodal_model', m.id);
                                localStorage.setItem('ai_vision_model', m.id);
                              }
                              setIsModelDropdownOpen(false);
                            }}
                            className={`w-full p-2 rounded-xl text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200'
                                : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-2xs">
                                {getModelIcon(m.id, "w-5 h-5")}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate">{m.name}</div>
                                <div className="text-[9px] text-slate-400 truncate">{provider}</div>
                              </div>
                            </div>
                            {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 3. 品类场景与拍摄架构 (仅在「原创策划工坊」中需要；「爆款换人换品工坊」由社媒图决定场景构图，无需此配方) */}
          {workshopMode !== 'social_face_product_swap' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                  <div className="w-5 h-5 rounded-lg bg-pink-50 border border-pink-200/80 text-pink-600 flex items-center justify-center shadow-2xs">
                    <Sliders className="w-3 h-3" />
                  </div>
                  <span>品类场景与拍摄架构 (Prompt Recipe)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsExtractModalOpen(true)}
                  className="text-xs text-pink-600 hover:text-pink-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  title="从参考样张/图集进行品类架构推理，生成通用提示词架构"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>+ 架构推理</span>
                </button>
              </div>

              {/* 当前生效的拍摄架构卡片 */}
              {(() => {
                const activeStyle = customRecipes.find(r => r.id === selectedStyleId);
                const isCustomActive = Boolean(activeStyle);

                const activeName = isCustomActive ? activeStyle.name : '✨ 自由智能创作 (未绑定固定模板)';
                const activeTag = isCustomActive 
                  ? (activeStyle.tag || '用户专属架构推理拍摄架构') 
                  : '由视觉大模型全权根据商品实物图自适应构思空间与光影';
                
                const defaultAutoSnippet = '【智能自由创作模式】：大模型依据商品真实材质与调性，自由有机地构思真实空间纵深、高级光影与生活道具，生成独一无二的高质感生活买家秀。';
                const currentActivePromptSnippet = customStyleText || (isCustomActive ? (activeStyle?.promptSnippet || activeStyle?.prompt_snippet || '') : defaultAutoSnippet);

                return (
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xs font-bold text-sm ${
                          isCustomActive ? 'bg-gradient-to-br from-pink-500 to-rose-600 text-white' : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
                        }`}>
                          {isCustomActive ? activeName.replace(/^[✨\s]+/, '').slice(0, 2) : '🎯'}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                            <span>{activeName}</span>
                            {customStyleText && (
                              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-200 font-bold">
                                🟢 已微调
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                            {activeTag}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isCustomActive && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`确定要删除「${activeStyle.name}」配方吗？`)) return;
                              try {
                                const res = await fetch(`/api/styles?id=${selectedStyleId}`, { method: 'DELETE' });
                                const data = await res.json();
                                if (data.success) {
                                  setCustomRecipes(prev => prev.filter(r => r.id !== selectedStyleId));
                                  setSelectedStyleId('auto');
                                }
                              } catch (err) {
                                console.error('删除配方失败:', err);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer border border-slate-200/60 hover:border-red-200"
                            title="删除当前自定义配方"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setIsRecipeBrowserOpen(true)}
                          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 border border-indigo-200/60"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>{customRecipes.length > 0 ? '更换' : '配方库'}</span>
                        </button>
                      </div>
                    </div>

                    {/* 快捷专属配方胶囊 */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pt-1 scrollbar-thin text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStyleId('auto');
                          setCustomStyleText('');
                          setIsEditingStyleSnippet(false);
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer ${
                          selectedStyleId === 'auto'
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        🎯 自由智能创作
                      </button>
                      {customRecipes.map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setSelectedStyleId(r.id);
                            setCustomStyleText('');
                            setIsEditingStyleSnippet(false);
                          }}
                          className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer truncate max-w-[140px] ${
                            selectedStyleId === r.id
                              ? 'bg-pink-600 text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title={`品类专属架构: ${r.name}`}
                        >
                          ✨ {r.name.length > 8 ? r.name.slice(0, 7) + '..' : r.name}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setIsExtractModalOpen(true)}
                        className="px-2 py-1 rounded-lg font-bold whitespace-nowrap text-pink-600 hover:bg-pink-50 transition-all cursor-pointer flex items-center gap-0.5 border border-pink-200/60"
                      >
                        <Sparkles className="w-3 h-3 text-pink-500" />
                        <span>+ 架构推理</span>
                      </button>
                    </div>

                    {/* 🌟 提示词查看与实时修改面板 (透明可见、随时修改、所改即所用) */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setIsViewingStyleSnippet(prev => !prev)}
                          className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{isViewingStyleSnippet ? '收起提示词架构' : '👁️ 查看/修改提示词架构'}</span>
                          <span className="text-[10px] text-slate-400 font-mono font-normal">
                            ({currentActivePromptSnippet.length} 字符)
                          </span>
                        </button>

                        <div className="flex items-center gap-2">
                          {isViewingStyleSnippet && !isEditingStyleSnippet && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!customStyleText) setCustomStyleText(activeStyle?.promptSnippet || '');
                                setIsEditingStyleSnippet(true);
                              }}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer hover:underline"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>修改此提示词</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(currentActivePromptSnippet);
                              setCopiedStyleSnippet(true);
                              setTimeout(() => setCopiedStyleSnippet(false), 2000);
                            }}
                            className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                            title="复制当前提示词内容"
                          >
                            {copiedStyleSnippet ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedStyleSnippet ? '已复制' : '复制'}</span>
                          </button>
                        </div>
                      </div>

                      {/* 展开的提示词查看/修改内容区域 */}
                      {isViewingStyleSnippet && (
                        <div className="space-y-2 animate-fade-in">
                          {isEditingStyleSnippet ? (
                            <div className="space-y-2">
                              <textarea
                                value={customStyleText || activeStyle?.promptSnippet || ''}
                                onChange={e => setCustomStyleText(e.target.value)}
                                rows={6}
                                placeholder="在此自由修改提示词置景逻辑与光影规则..."
                                className="w-full p-2.5 rounded-xl bg-slate-50 border border-indigo-300 text-xs text-slate-800 font-mono leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500/20 outline-none resize-y"
                              />
                              <div className="flex items-center justify-between">
                                <div className="text-[10px] text-slate-400">
                                  提示：此处修改将直接作为本次 AI 提炼分镜的专属架构
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCustomStyleText('');
                                      setIsEditingStyleSnippet(false);
                                    }}
                                    className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
                                  >
                                    重置为默认
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setIsEditingStyleSnippet(false)}
                                    className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>完成修改</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
                              {currentActivePromptSnippet}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}


          {/* 4. Shot Count Display / Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shadow-2xs">
                  <Layers className="w-3 h-3" />
                </div>
                <span>分镜镜头数量</span>
              </span>
              <span className="font-mono text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg text-xs border border-amber-200/80 font-bold">
                {workshopMode === 'social_face_product_swap' && clonedSocialImages.filter(i => i.selected).length > 0 
                  ? clonedSocialImages.filter(i => i.selected).length 
                  : shotCount} 个连拍机位
              </span>
            </div>
            {workshopMode === 'social_face_product_swap' ? (
              <div className="p-2.5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="font-bold text-amber-950">1:1 严格对齐参考图</span>
                </div>
                <span className="text-[11px] font-bold text-amber-800 bg-white px-2 py-0.5 rounded-lg border border-amber-200 shadow-2xs">
                  已锁定为 {clonedSocialImages.filter(i => i.selected).length || shotCount} 镜
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 p-1.5 rounded-2xl bg-slate-100/90 border border-slate-200/80">
                {[2, 3, 4, 6].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setShotCount(num)}
                    className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center ${
                      shotCount === num
                        ? 'bg-white text-amber-800 shadow-xs font-bold border border-slate-200'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {num} 镜
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 5. Extra Scene Requirements Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-2">
                <div className="w-5 h-5 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-600 flex items-center justify-center shadow-2xs">
                  <Lightbulb className="w-3 h-3" />
                </div>
                <span>额外场景定制要求 (可选)</span>
              </label>
              {extraRequirements && (
                <button
                  type="button"
                  onClick={() => setExtraRequirements('')}
                  className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  清空
                </button>
              )}
            </div>
            <input
              type="text"
              value={extraRequirements}
              onChange={e => setExtraRequirements(e.target.value)}
              placeholder="如：暖阳斜射、桌面摆放冰美式、手持开箱等"
              className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-xs outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-2xs"
            />
            {/* 快捷灵感场景点选 */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {[
                '☀️ 暖阳斜射',
                '☕ 桌面随手拍',
                '🖐️ 手持开箱实操',
                '🌙 氛围感夜景',
                '🌿 绿植原木点缀'
              ].map((tag, tIdx) => (
                <button
                  key={tIdx}
                  type="button"
                  onClick={() => {
                    const cleanTag = tag.replace(/^[^\s]+\s*/, '');
                    if (!extraRequirements) {
                      setExtraRequirements(cleanTag);
                    } else if (!extraRequirements.includes(cleanTag)) {
                      setExtraRequirements(`${extraRequirements}，${cleanTag}`);
                    }
                  }}
                  className="px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 text-[10px] font-medium transition-colors cursor-pointer border border-slate-200/80 shadow-2xs"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Docked Action Button */}
        <div className="p-4 border-t border-slate-200/80 bg-slate-50/80 flex-shrink-0">
          <button
            onClick={handleGeneratePrompts}
            disabled={isAnalyzing}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-[0_6px_20px_rgba(99,102,241,0.28)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98] btn-shimmer"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>视觉大模型智能看图中...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 text-white" />
                <span>{generatedPrompts.length > 0 ? `重新策划 (${effectiveShotCount} 镜)` : `启动 AI 多模态分镜策划 (${effectiveShotCount} 镜)`}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right Canvas: Shot Cards & Fast Management Workbench */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8F9FC]">
        {/* Top Action Bar */}
        <div className="h-16 px-6 lg:px-8 border-b border-slate-200/80 bg-white flex items-center justify-between flex-shrink-0 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
                <Wand2 className="w-3.5 h-3.5" />
              </div>
              <span>买家秀生图提示词工作台 (纯中文)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {generatedPrompts.length > 0 ? (
                <>已生成 <span className="font-bold text-indigo-600">{generatedPrompts.length}</span> 个分镜 · 已勾选 <span className="font-bold text-emerald-600">{selectedPromptCount}</span> 个待生图</>
              ) : (
                <>配置左侧参数后，点击启动即可自动拆解并策划分镜</>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {generatedPrompts.length > 0 && (
              <>
                <button
                  onClick={() => addShotPrompt()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加分镜</span>
                </button>

                <button
                  onClick={() => setShowBatchReplace(!showBatchReplace)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer shadow-2xs ${
                    showBatchReplace 
                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold' 
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                  title="在所有分镜提示词中批量查找并替换特定关键词"
                >
                  <RotateCw className="w-3.5 h-3.5 text-amber-600" />
                  <span>批量替换</span>
                </button>

                <button
                  onClick={() => {
                    const cleaned = generatedPrompts.map(p => ({
                      ...p,
                      prompt: cleanPromptText(p.prompt)
                    }));
                    setGeneratedPrompts(cleaned, productFingerprint);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                  title="彻底清除可能残留的 JSON 字段或格式代码，仅保留纯净自然语言提示词"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>纯净清洗</span>
                </button>

                <button
                  onClick={handleCopyAll}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                  {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAll ? '已复制全部' : '复制全部'}</span>
                </button>

                <button
                  onClick={() => {
                    initGenerationTasks(false);
                    onNextToStep3();
                  }}
                  disabled={selectedPromptCount === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-40"
                >
                  <span>下一步：AI 矩阵生图 ({selectedPromptCount})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* 🌟 批量查找替换浮层栏 */}
        {showBatchReplace && generatedPrompts.length > 0 && (
          <div className="bg-amber-50/90 border-b border-amber-200 px-6 py-3 flex items-center justify-between gap-4 animate-fade-in text-xs">
            <div className="flex items-center gap-2 flex-1 max-w-2xl">
              <span className="font-bold text-amber-950 shrink-0">全局批量替换：</span>
              <input
                type="text"
                value={findKeyword}
                onChange={e => setFindKeyword(e.target.value)}
                placeholder="查找文本 (如：木质桌面)..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-slate-800 placeholder-slate-400 outline-none focus:border-amber-500"
              />
              <span className="text-amber-600 font-bold shrink-0">➔</span>
              <input
                type="text"
                value={replaceKeyword}
                onChange={e => setReplaceKeyword(e.target.value)}
                placeholder="替换为 (如：纯白大理石台面)..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-amber-200 text-slate-800 placeholder-slate-400 outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (!findKeyword.trim()) return;
                  const updated = generatedPrompts.map(p => ({
                    ...p,
                    prompt: p.prompt.replaceAll(findKeyword, replaceKeyword)
                  }));
                  setGeneratedPrompts(updated, productFingerprint);
                  setShowBatchReplace(false);
                  setFindKeyword('');
                  setReplaceKeyword('');
                }}
                disabled={!findKeyword.trim()}
                className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-all cursor-pointer disabled:opacity-40"
              >
                一键替换所有分镜
              </button>
              <button
                type="button"
                onClick={() => setShowBatchReplace(false)}
                className="px-3 py-1.5 rounded-xl text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6">
          {/* 🌟 1. 顶部已挂载商品实物素材与特征感知看板 (增强用户对多模态大模型的感知) */}
          <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {effectiveImages.length > 0 ? (
                <div className="flex -space-x-2 overflow-hidden shrink-0">
                  {effectiveImages.slice(0, 5).map((img, iIdx) => (
                    <img
                      key={iIdx}
                      src={img.url}
                      alt=""
                      className="inline-block h-11 w-11 rounded-2xl ring-2 ring-white object-cover shadow-xs bg-slate-100"
                    />
                  ))}
                </div>
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-100">
                  <Eye className="w-5 h-5" />
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <h4 className="text-xs font-bold text-slate-900 truncate">
                    {product?.title ? `商品实物：${product.title}` : `已挂载 ${effectiveImages.length} 张实物图进行多模态策划`}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 shrink-0">
                    ● 实物外观指纹已锁定
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  大模型将 100% 对齐素材图中的真实外观、涂层材质与比例结构，拒绝凭空生造
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onBackToStep1}
              className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span>重新勾选素材图</span>
            </button>
          </div>

          {/* 🌟 2. 爆款复刻模式：模特人脸与机位一致性锁定链路看板 */}
          {workshopMode === 'social_face_product_swap' && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-pink-50 via-purple-50 to-indigo-50 border border-pink-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {anchorFaceImageUrl && !isNoModel ? (
                  <img 
                    src={anchorFaceImageUrl} 
                    alt="专属模特" 
                    className="w-10 h-10 rounded-2xl object-cover ring-2 ring-purple-400 shadow-sm flex-shrink-0" 
                  />
                ) : (
                  <span className="w-9 h-9 rounded-2xl bg-pink-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    🔥
                  </span>
                )}
                <div>
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span>爆款复刻多模态策划就绪</span>
                    {isNoModel ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                        📦 纯商品静物复刻 (免定脸极速生图)
                      </span>
                    ) : anchorFaceImageUrl ? (
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold border border-purple-200">
                        👑 专属真人模特面容已锁定
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold border border-purple-200">
                        🧑 模特人脸一致性克隆已锁定
                      </span>
                    )}
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    {isNoModel 
                      ? '1:1 复刻社媒爆款图的光影与构图，精准替换为目标实物商品' 
                      : (anchorFaceImageUrl 
                          ? '已绑定您上传的专属真人模特正脸照，所有分镜将 100% 继承该模特的五官面容与真实肤质' 
                          : `第 1 镜为【基准定脸镜头】，后续镜头 100% 继承【${modelPersona || '新模特'}】同一面容五官与肤质`)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Extracted Product Appearance Fingerprint */}
          {productFingerprint && (
            <div className="p-5 rounded-3xl bg-white border border-indigo-100 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  商品核心外观指纹 (AI 保真锚点)
                </span>
                <button
                  onClick={() => {
                    setCustomFingerprint(productFingerprint);
                    setIsEditingFingerprint(!isEditingFingerprint);
                  }}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingFingerprint ? '取消编辑' : '微调指纹'}</span>
                </button>
              </div>

              {isEditingFingerprint ? (
                <div className="space-y-2.5">
                  <textarea
                    value={customFingerprint}
                    onChange={e => setCustomFingerprint(e.target.value)}
                    rows={2}
                    className="w-full p-3 rounded-2xl bg-slate-50 border border-indigo-200 text-slate-900 text-xs outline-none focus:bg-white focus:border-indigo-500"
                  />
                  <button
                    onClick={handleSaveFingerprint}
                    className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-sm cursor-pointer hover:bg-indigo-700"
                  >
                    保存指纹修改
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-xs text-slate-700 leading-relaxed font-mono bg-slate-50/90 p-3 rounded-2xl border border-slate-200/60">
                    {productFingerprint}
                  </p>

                  {/* 🌟 硬件底座与结构一键锁定快捷标签 */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                    <span className="font-bold text-slate-500">🔒 锁定底座形态:</span>
                    {[
                      { label: '🔷 六边形切面底座', desc: '原装哑光黑色六边形几何切面底座与立柱支架' },
                      { label: '✌️ V型电竞爪底座', desc: '原装黑色V型人字分叉电竞金属爪底座与立柱支架' },
                      { label: '🔲 矩形金属平板底座', desc: '原装极简哑光黑色矩形金属平板底座与方形立柱支架' },
                      { label: '⚪ 极简圆盘底座', desc: '原装极简纯黑圆形圆盘底座与纤细立柱支架' },
                      { label: '🦾 机械臂悬浮', desc: '搭配黑色铝合金人体工学气压机械臂桌面夹持悬浮支架(无桌面底座)' }
                    ].map((baseOpt, bIdx) => {
                      const isActive = productFingerprint.includes(baseOpt.desc.slice(0, 8));
                      return (
                        <button
                          key={bIdx}
                          type="button"
                          onClick={() => {
                            let newFp = productFingerprint;
                            const baseRegex = /(?:底部配有[^，。\n]*|原装[^，。\n]*底座[^，。\n]*|搭配[^，。\n]*机械臂[^，。\n]*)/g;
                            if (baseRegex.test(newFp)) {
                              newFp = newFp.replace(baseRegex, `底部必须严格配备【${baseOpt.desc}】`);
                            } else {
                              newFp = `${newFp}，底部必须严格配备【${baseOpt.desc}】`;
                            }
                            useAppStore.setState({ productFingerprint: newFp });

                            const updatedPrompts = generatedPrompts.map(p => {
                              let newPrompt = p.prompt;
                              if (newPrompt.includes('底座') || newPrompt.includes('支架')) {
                                newPrompt = newPrompt.replace(/(?:底部配有[^，。\n]*|原装[^，。\n]*底座[^，。\n]*)/g, `底部严格配有${baseOpt.desc}`);
                              } else {
                                newPrompt = `${newPrompt}，商品底部严格配备${baseOpt.desc}`;
                              }
                              return { ...p, prompt: newPrompt };
                            });
                            setGeneratedPrompts(updatedPrompts);
                          }}
                          className={`px-3 py-1 rounded-xl border transition-all cursor-pointer ${
                            isActive
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-bold'
                              : 'bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border-slate-200'
                          }`}
                        >
                          {baseOpt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Prompts Cards Grid vs Rich Visual Planning Preview Canvas */}
          {generatedPrompts.length > 0 ? (
            <div className="space-y-5 pb-20">
              {/* 🌟 物理空间主场景环境一致性锁看板 */}
              <div className="p-4 rounded-3xl bg-gradient-to-r from-indigo-50/90 via-sky-50/70 to-blue-50/90 border border-indigo-100/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-xs flex-shrink-0">
                    <Film className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <span>已锁定全套分镜统一主物理空间</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold border border-indigo-200">
                        同物理场景连拍
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      全套 {generatedPrompts.length} 个分镜共享相同房间光影、环境材质与色温，机位与动作视角多维丰富
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-indigo-700 font-bold">
                  <span className="px-2.5 py-1 rounded-xl bg-white border border-indigo-200 shadow-2xs">💡 统一自然光影</span>
                  <span className="px-2.5 py-1 rounded-xl bg-white border border-indigo-200 shadow-2xs">🎨 统一生活场景</span>
                  <span className="px-2.5 py-1 rounded-xl bg-white border border-indigo-200 shadow-2xs">🎯 100%实物材质保真</span>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {generatedPrompts.map((shot, idx) => {
                  const isSelected = shot.selected !== false;
                  return (
                    <div
                      key={idx}
                      className={`rounded-3xl border bg-white p-4 sm:p-5 space-y-3 transition-all shadow-xs ${
                        isSelected 
                          ? 'border-indigo-200 ring-2 ring-indigo-500/10 hover:shadow-md' 
                          : 'border-slate-200 opacity-60'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleShotSelection(idx)}
                            className="rounded accent-indigo-600 cursor-pointer w-4 h-4 shrink-0"
                          />
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100 shrink-0">
                            SHOT {shot.shot_no || idx + 1}
                          </span>
                          
                          {/* 智能主体微胶囊 */}
                          {shot.has_human === false ? (
                            <button
                              type="button"
                              onClick={() => updateShotPrompt(idx, { has_human: true, shot_type: 'model_shot' })}
                              className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                              title="点击切换为模特出镜模式"
                            >
                              <span>📦 纯静物</span>
                            </button>
                          ) : shot.shot_type === 'hand_held_only' ? (
                            <button
                              type="button"
                              onClick={() => updateShotPrompt(idx, { has_human: false, shot_type: 'pure_product' })}
                              className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                              title="点击切换为纯静物模式"
                            >
                              <span>🖐️ 局部手持</span>
                            </button>
                          ) : anchorFaceImageUrl ? (
                            <button
                              type="button"
                              onClick={() => updateShotPrompt(idx, { has_human: false, shot_type: 'pure_product' })}
                              className="px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold border border-indigo-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                              title="点击切换为纯静物模式"
                            >
                              <span>👑 专属模特</span>
                            </button>
                          ) : idx === 0 ? (
                            <button
                              type="button"
                              onClick={() => updateShotPrompt(idx, { has_human: false, shot_type: 'pure_product' })}
                              className="px-2 py-0.5 rounded-md bg-pink-100 hover:bg-pink-200 text-pink-700 text-[10px] font-bold border border-pink-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                              title="点击切换为纯静物模式"
                            >
                              <span>🎯 定脸首图</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => updateShotPrompt(idx, { has_human: false, shot_type: 'pure_product' })}
                              className="px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 text-[10px] font-bold border border-purple-200 flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                              title="点击切换为纯静物模式"
                            >
                              <span>🔒 继承首图</span>
                            </button>
                          )}

                          <input
                            type="text"
                            value={shot.title || `分镜 ${idx + 1}`}
                            onChange={e => updateShotPrompt(idx, { title: e.target.value })}
                            placeholder={`分镜 ${idx + 1}`}
                            className="text-xs font-bold text-slate-800 bg-transparent hover:text-indigo-600 focus:text-indigo-600 outline-none truncate flex-1 min-w-0"
                          />
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => handleCopy(shot.prompt, idx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="复制分镜提示词"
                          >
                            {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => deleteShotPrompt(idx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="删除此分镜"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 🌟 本镜实物商品图精准绑定选择器 (精准指定当前分镜使用的正面/背面/侧面/细节实物图) */}
                      {effectiveImages.length > 0 && (() => {
                        const defaultUrl = effectiveImages[idx % effectiveImages.length]?.url || effectiveImages[0]?.url;
                        const currentShotImgUrl = shot.productImageUrl || defaultUrl;
                        const activeImgIndex = effectiveImages.findIndex(img => img.url === currentShotImgUrl);
                        const effectiveIndex = activeImgIndex >= 0 ? activeImgIndex : (idx % effectiveImages.length);
                        const activeImgItem = effectiveImages[effectiveIndex] || effectiveImages[0];

                        // 视角标签
                        const isBackShot = /背壳|背面|后背|背部|后侧|背面装甲/i.test((shot.title || '') + ' ' + (shot.scene || ''));
                        const isSideShot = /45度|斜侧|侧面|侧视|俯角|侧方/i.test((shot.title || '') + ' ' + (shot.scene || ''));
                        const angleLabel = isBackShot ? '背面视角' : isSideShot ? '45°斜侧视角' : effectiveIndex === 0 ? '正面主图视角' : `底图视角 #${effectiveIndex + 1}`;

                        return (
                          <div className="flex items-center justify-between gap-2 p-2 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-[11px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={activeImgItem.url}
                                alt="本镜商品实物图"
                                className="w-8 h-8 rounded-lg object-cover bg-white border border-indigo-200 flex-shrink-0 shadow-2xs"
                              />
                              <div className="min-w-0">
                                <span className="font-bold text-indigo-950 flex items-center gap-1.5 truncate">
                                  <span>🎯 本镜实物垫图:</span>
                                  <span className="text-indigo-700 font-bold bg-white px-1.5 py-0.5 rounded border border-indigo-200 text-[10px]">
                                    底图 #{effectiveIndex + 1} · {angleLabel}
                                  </span>
                                </span>
                              </div>
                            </div>

                            {/* 快速选择商品图片切换按钮组 (仅展示用户勾选的 1~N 张底图) */}
                            {effectiveImages.length > 1 && (
                              <div className="flex items-center gap-1.5 overflow-x-auto max-w-[240px] scrollbar-none flex-shrink-0">
                                <span className="text-[10px] text-slate-500 font-medium">指定:</span>
                                {effectiveImages.map((imgItem, imgIdx) => {
                                  const isCur = imgItem.url === activeImgItem.url;
                                  return (
                                    <button
                                      key={imgIdx}
                                      type="button"
                                      onClick={() => updateShotPrompt(idx, { productImageUrl: imgItem.url })}
                                      className={`relative w-7 h-7 rounded-lg overflow-hidden border transition-all cursor-pointer flex-shrink-0 ${
                                        isCur 
                                          ? 'ring-2 ring-indigo-600 border-indigo-600 scale-105 shadow-xs' 
                                          : 'opacity-50 hover:opacity-100 border-slate-300 hover:border-indigo-400'
                                      }`}
                                      title={`点击将分镜 ${idx + 1} 绑定为勾选的素材底图 #${imgIdx + 1}`}
                                    >
                                      <img src={imgItem.url} alt="" className="w-full h-full object-cover" />
                                      <span className="absolute bottom-0 right-0 bg-slate-900/80 text-white text-[8px] font-bold px-0.5 rounded-tl leading-none">
                                        #{imgIdx + 1}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Social Reference Thumbnail for this shot (only when in clone mode) */}
                      {workshopMode === 'social_face_product_swap' && selectedClonedList[idx] && (
                        <div className="flex items-center gap-2.5 p-2 rounded-2xl bg-pink-50/60 border border-pink-100">
                          <img
                            src={selectedClonedList[idx].url}
                            alt=""
                            className="w-10 h-10 rounded-xl object-cover bg-white border border-pink-200 flex-shrink-0"
                          />
                          <div className="text-[11px] text-pink-900 leading-tight">
                            <span className="font-bold">📸 对标社媒参考图 #{idx + 1}：</span>
                            <span className="text-pink-700">
                              {shot.has_human === false 
                                ? '继承构图与光影，替换为目标商品'
                                : shot.shot_type === 'hand_held_only'
                                ? '继承持物动线，替换为目标商品'
                                : '继承机位与姿态，替换为新模特与目标商品'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Prompt Textarea */}
                      <textarea
                        value={shot.prompt}
                        onChange={e => updateShotPrompt(idx, { prompt: e.target.value })}
                        rows={4}
                        placeholder="请输入此分镜的 AI 提示词..."
                        className="w-full p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 text-slate-800 text-xs leading-relaxed outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-mono resize-y shadow-2xs"
                      />

                      {/* 🌟 单分镜快捷操作栏 (独立换视角 / 智能润色 / 字符统计) */}
                      <div className="flex items-center justify-between pt-0.5 text-[11px]">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRerollSingleShot(idx)}
                            className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 font-semibold border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                            title="换个视角与机位重构此分镜"
                          >
                            <RotateCw className="w-3 h-3 text-indigo-500" />
                            <span>换视角</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePolishSingleShot(idx)}
                            className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 font-semibold border border-slate-200 transition-all flex items-center gap-1 cursor-pointer"
                            title="增强光影细节与8K写实感"
                          >
                            <Sparkles className="w-3 h-3 text-emerald-500" />
                            <span>智能润色</span>
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {shot.prompt?.length || 0} 字符
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 🌟 高颜值 AI 视觉分镜策划预览工坊 (告别单调大白板，丰富排版) */
            <div className="space-y-6 pb-20 max-w-5xl mx-auto animate-fade-in">
              {/* 1. 顶部引导看板 (统一主行动点) */}
              {(() => {
                const selectedClonedList = clonedSocialImages.filter(i => i.selected);
                const currentDisplayShotCount = workshopMode === 'social_face_product_swap' && selectedClonedList.length > 0
                  ? selectedClonedList.length
                  : shotCount;

                const activeCustomRecipe = customRecipes.find(r => r.id === selectedStyleId);
                const isCustomActive = Boolean(activeCustomRecipe) && workshopMode !== 'social_face_product_swap';

                return (
                  <>
                    <div className="p-6 sm:p-7 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4">
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-100/80 shadow-2xs">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                              <span>{workshopMode === 'social_face_product_swap' ? '爆款复刻 · 多模态视觉引擎' : '原创多模态 · AI 视觉总监'}</span>
                            </span>
                            {isCustomActive && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 text-[11px] font-bold border border-pink-200">
                                🎨 已挂载：{activeCustomRecipe.name}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                              ● 实物材质与光影100%保真
                            </span>
                          </div>
                          <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                            {workshopMode === 'social_face_product_swap'
                              ? `爆款复刻：对标 ${currentDisplayShotCount} 组社媒机位，克隆目标实物与模特`
                              : isCustomActive
                              ? `遵循【${activeCustomRecipe.name.replace(/^[✨\s]+/, '')}】定制规划 ${currentDisplayShotCount} 组买家秀机位`
                              : `AI 多模态分镜策划就绪 (共 ${currentDisplayShotCount} 个连续镜头)`}
                          </h3>
                          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                            {workshopMode === 'social_face_product_swap'
                              ? `大模型将逐镜头提取参考图中的景深透视，将目标商品【${product?.title || '目标实物'}】以自然光影融入，保持全套分镜视觉连贯。`
                              : `大模型将深度解构素材图中的真实轮廓与材质属性，为您自动输出全景定场、微距质感、生活交互等 ${currentDisplayShotCount} 组全套纯中文摄影指令。`}
                          </p>
                        </div>

                        <button
                          onClick={handleGeneratePrompts}
                          disabled={isAnalyzing}
                          className="w-full md:w-auto px-7 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-xs sm:text-sm shadow-[0_6px_20px_rgba(99,102,241,0.25)] hover:shadow-[0_8px_25px_rgba(99,102,241,0.35)] transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 btn-shimmer shrink-0"
                        >
                          {isAnalyzing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-white" />
                              <span>大模型推理策划中...</span>
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-4 h-4 text-white" />
                              <span>启动 AI 分镜策划 ({currentDisplayShotCount} 镜) ➔</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* 镜头机位预期蓝图 */}
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <span className="flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            <span>预计生成的分镜机位蓝图 (共 {currentDisplayShotCount} 个镜头)</span>
                          </span>
                          <span className="text-[11px] text-slate-400 font-normal">
                            点击上方按钮即可自动策划完整中文提示词
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {Array.from({ length: currentDisplayShotCount }).map((_, sIdx) => {
                            const refImg = selectedClonedList[sIdx];
                            const originalInspireTips = [
                              { title: '机位 #1：全景空间定场', desc: '全景空间定场 · 锁定统一物理光影与透视' },
                              { title: '机位 #2：微距质感雕刻', desc: '微距质感雕刻 · 还原真实材质倒角与骨相' },
                              { title: '机位 #3：沉浸生活交互', desc: '沉浸生活叙事 · 手持/开箱/佩戴/使用动态' },
                              { title: '机位 #4：光影情绪沉淀', desc: '氛围情绪沉淀 · 随手搁置/斜阳掠影/生活余温' },
                              { title: '机位 #5：多维视角延展', desc: '多维视角延展 · 探索更多生活化镜头可能' },
                              { title: '机位 #6：全景闭环叙事', desc: '完整视觉篇章 · 统一空间内多样化镜头' }
                            ];
                            const inspireTip = originalInspireTips[sIdx % originalInspireTips.length];

                            return (
                              <div
                                key={sIdx}
                                className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-indigo-200 hover:shadow-xs transition-all space-y-2 group"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-mono font-bold border border-indigo-100">
                                      SHOT {sIdx + 1}
                                    </span>
                                    <span className="text-xs font-bold text-slate-800">
                                      {inspireTip.title}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                                    <Sparkles className="w-3 h-3 text-indigo-400" />
                                    <span>待构思</span>
                                  </span>
                                </div>

                                {workshopMode === 'social_face_product_swap' && refImg ? (
                                  <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-pink-100 shadow-2xs">
                                    <img
                                      src={refImg.url}
                                      alt=""
                                      className="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
                                    />
                                    <div className="min-w-0 flex-1 text-[11px] text-slate-600 truncate">
                                      对标参考图 #{sIdx + 1} · 替换为【{product?.title || '目标实物'}】
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-slate-500 leading-snug">
                                    {inspireTip.desc}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Recipe Architecture Browser Modal */}
      <RecipeBrowserModal
        isOpen={isRecipeBrowserOpen}
        onClose={() => setIsRecipeBrowserOpen(false)}
        selectedStyleId={selectedStyleId}
        onSelectStyle={(id) => setSelectedStyleId(id)}
        onOpenExtractModal={() => setIsExtractModalOpen(true)}
      />

      {/* Style Reverse-engineering and Category Recipe Modal */}
      <StyleExtractModal
        isOpen={isExtractModalOpen}
        onClose={() => setIsExtractModalOpen(false)}
        onRecipeCreated={(newRecipe) => {
          setCustomRecipes(prev => [newRecipe, ...prev]);
          setSelectedStyleId(newRecipe.id);
          if (newRecipe.category) {
            setCategoryTab(newRecipe.category);
          }
        }}
      />

      {/* Category Manager Modal */}
      <CategoryManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        onCategoriesChanged={updated => setAvailableCategories(updated)}
      />
    </div>
  );
}
