'use client';
import {apiFetch, proxyMediaUrl } from '@/lib/apiClient';
import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { STYLE_PRESETS, getMergedStylePresets, VISION_MODELS, ShotPrompt, getMergedCategories, pickVisionAnalyzeFallbacks } from '@/lib/vision';
import {
  normalizeImageUrlToStandardJpg,
  cleanPromptText,
  ensureSocialPromptSlots,
  assembleOriginalShotPrompt,
  enforceOriginalShotDiversity,
} from '@/lib/drawing';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { getModelProviderName } from '@/features/hub/PromptActionBar';
import {
  getEnabledMultimodalModelsFromSettings,
  repairWorkflowModelsInStorage,
  resolveStoredMultimodalModelId,
  setStoredMultimodalModelId,
} from '@/lib/workflowModels';
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
  Film,
  AlertCircle,
  ShoppingBag,
  X,
  FileText
} from 'lucide-react';

import StyleExtractModal from '@/shared/modals/StyleExtractModal';
import CategoryManagerModal from '@/shared/modals/CategoryManagerModal';
import RecipeBrowserModal from '@/shared/modals/RecipeBrowserModal';
import ManualArchitecturePanel from '@/shared/modals/ManualArchitecturePanel';
import { recordModelUsage } from '@/lib/usageTracker';
import PromptStudioStylePicker from './PromptStudioStylePicker';
import PromptStudioAnalyzePanel from './PromptStudioAnalyzePanel';
import PromptStudioGroupLocks from './PromptStudioGroupLocks';
import PromptStudioShotList from './PromptStudioShotList';
import PromptStudioEmptyPreview from './PromptStudioEmptyPreview';

interface Props {
  onBackToStep1: () => void;
  onNextToStep3: () => void;
  onOpenPromptHistory?: () => void;
  onOpenSettings?: () => void;
  /** 顶栏已提供导航与主 CTA 时隐藏侧栏返回与右侧下一步 */
  hideChromeNav?: boolean;
}

export default function PromptStudio({ 
  onBackToStep1, 
  onNextToStep3,
  onOpenPromptHistory,
  onOpenSettings,
  hideChromeNav,
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
    productRole,
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
    originalAnchorFaceImageUrl,
    initGenerationTasks,
    masterScene,
    setMasterScene,
    lookBible,
    setLookBible,
    identityBible,
    setIdentityBible,
    styleBible,
    setStyleBible,
    setLookParts,
    applyGroupLocksToPrompts,
  } = useAppStore();

  const isNoModel = !modelPersona || modelPersona === 'none' || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物');
  const effectiveAnchorFaceImageUrl = workshopMode === 'storyboard_generate'
    ? originalAnchorFaceImageUrl
    : anchorFaceImageUrl;

  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [customStyleText, setCustomStyleText] = useState('');
  const [isViewingStyleSnippet, setIsViewingStyleSnippet] = useState(false);
  const [isEditingStyleSnippet, setIsEditingStyleSnippet] = useState(false);
  const [copiedStyleSnippet, setCopiedStyleSnippet] = useState(false);
  const [customFingerprint, setCustomFingerprint] = useState('');
  const [isEditingFingerprint, setIsEditingFingerprint] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisModelHint, setAnalysisModelHint] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg(null), 4200);
  };

  // 全局提示词批量查找替换状态
  const [showBatchReplace, setShowBatchReplace] = useState(false);
  const [findKeyword, setFindKeyword] = useState('');
  const [replaceKeyword, setReplaceKeyword] = useState('');

  // 自定义配方与逆向弹窗状态
  const [customRecipes, setCustomRecipes] = useState<any[]>([]);
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);
  const [isRecipeBrowserOpen, setIsRecipeBrowserOpen] = useState(false);
  const [isManualArchOpen, setIsManualArchOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [categoryTab, setCategoryTab] = useState<string>('all');
  // 多模态大模型列表（统一 Comfly 的 isMultimodal || isVision 字段，排除纯生图/生视频模型）
  const [availableVisionModels, setAvailableVisionModels] = useState<any[]>(VISION_MODELS);
  const [availableCategories, setAvailableCategories] = useState<any[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
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
    repairWorkflowModelsInStorage();

    let modelsList = VISION_MODELS;
    const multimodalFromSettings = getEnabledMultimodalModelsFromSettings();
    if (multimodalFromSettings.length > 0) {
      modelsList = multimodalFromSettings.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        shortName: m.shortName || (m.name || m.id).split(' ')[0],
        provider: m.provider || '多模态',
        isMultimodal: !!(m.isMultimodal || m.isVision),
      }));
      setAvailableVisionModels(modelsList);
    }

    const resolvedModel = resolveStoredMultimodalModelId(multimodalFromSettings);
    setSelectedVisionModel(resolvedModel);
    setStoredMultimodalModelId(resolvedModel);
  };

  useEffect(() => {
    loadMultimodalModels();
    window.addEventListener('models_updated', loadMultimodalModels);
    return () => window.removeEventListener('models_updated', loadMultimodalModels);
  }, []);

  // 获取用户保存的自定义配方库
  const fetchRecipes = async () => {
    try {
      const res = await apiFetch('/api/catalog/styles');
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
        const changed = generatedPrompts.some((p, i) => (p.prompt || '') !== (cleaned[i].prompt || ''));
        if (changed) {
          setGeneratedPrompts(cleaned, productFingerprint);
        }
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
    setAnalysisError(null);
    setAnalysisModelHint(null);
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

      const {
        workshopMode,
        clonedSocialImages,
        modelPersona,
        getEffectiveAnchorFaceImageUrl,
      } = useAppStore.getState();
      const anchorFaceImageUrl = getEffectiveAnchorFaceImageUrl();
      const selectedClonedUrls = clonedSocialImages.filter(i => i.selected).map(i => i.url);
      const effectiveShotCount = workshopMode === 'social_face_product_swap' && selectedClonedUrls.length > 0 
        ? selectedClonedUrls.length 
        : shotCount;

      const activeVisionModel = availableVisionModels.find(m => m.id === selectedVisionModel) || availableVisionModels[0] || VISION_MODELS[0];
      const targetVisionModel = activeVisionModel?.id || selectedVisionModel || 'gemini-3.1-pro-preview-thinking-high';
      const localUrl = typeof window !== 'undefined' ? localStorage.getItem('ai_base_url') || undefined : undefined;
      const localKey = typeof window !== 'undefined' ? localStorage.getItem('ai_api_key') || undefined : undefined;

      const isSocialMode = workshopMode === 'social_face_product_swap';
      const targetSingleProductImg = product?.picUrl || effectiveImages[0]?.url;
      const targetProductImageUrls = isSocialMode
        ? (targetSingleProductImg ? [targetSingleProductImg] : [])
        : effectiveImages.map(img => img.url);

      let productProps: Record<string, string> = {};
      if (product?.props && typeof product.props === 'object') {
        productProps = product.props;
      } else if (product?.detailUrls) {
        try {
          const parsed = typeof product.detailUrls === 'string' ? JSON.parse(product.detailUrls) : product.detailUrls;
          if (parsed?.props && typeof parsed.props === 'object') {
            productProps = parsed.props;
          }
        } catch {}
      }

      const storeSnap = useAppStore.getState();
      const res = await apiFetch('/api/generate/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: workshopMode,
          productTitle: product?.title || '优质电商商品',
          productProps,
          imageUrls: targetProductImageUrls,
          referenceImageUrls: selectedClonedUrls,
          anchorFaceImageUrl: anchorFaceImageUrl || undefined,
          modelPersona: isSocialMode
            ? (anchorFaceImageUrl ? '已绑定专属真人模特正脸图（100% 真实面容克隆）' : modelPersona)
            : modelPersona,
          templateStyle: styleDesc,
          shotCount: effectiveShotCount,
          extraRequirements: extraRequirements,
          model: targetVisionModel,
          fallbackModels: pickVisionAnalyzeFallbacks(
            targetVisionModel,
            availableVisionModels.map((m: any) => m.id).filter(Boolean)
          ),
          customBaseUrl: localUrl,
          customApiKey: localKey,
          // 跨批次反雷同：组签名优先，兼容旧 masterScene 列表
          previousMasterScenes: isSocialMode
            ? []
            : (storeSnap.previousMasterScenes || []).slice(0, 2),
          previousGroupSignatures: isSocialMode
            ? []
            : (storeSnap.previousGroupSignatures || []).slice(0, 3),
        })
      });

      const data = await res.json().catch(() => ({ error: `视觉分析接口响应解析异常 (HTTP ${res.status})` }));

      if (!res.ok || data.error || !data.prompts || data.prompts.length === 0) {
        throw new Error(data.error || `视觉模型 [${targetVisionModel}] 分析失败 (HTTP ${res.status})，请检查模型额度或切换模型重试`);
      }

      const lookPartsFromApi = data.lookParts || data.look_parts || null;
      const styleBibleFromApi = data.styleBible || data.style_bible || '';
      const masterFromApi = data.masterScene || data.master_scene || '';
      const lookFromApi = data.lookBible || data.look_bible || '';
      const identityFromApi = data.identityBible || data.identity_bible || data.model_anchor_features || '';
      const productRoleFromApi = data.productRole || data.product_role || null;
      const fingerprintFromApi = data.productFingerprint || data.product_fingerprint || '';

      const cleanedPrompts = (data.prompts || []).map((p: any, idx: number) => {
        // 🌟 严格 1 对 1 分配用户勾选的多张底图：
        // 爆款复刻模式下统一绑定目标商品的纯净主图；原创模式下按分镜轮转分配
        const assignedImgUrl = isSocialMode
          ? (targetSingleProductImg || effectiveImages[0]?.url)
          : (effectiveImages[idx % effectiveImages.length]?.url || effectiveImages[0]?.url);

        const rawPrompt = cleanPromptText(p.prompt || p.description || (typeof p === 'string' ? p : ''));
        if (isSocialMode) {
          return {
            ...p,
            expression: p.expression || '',
            action: p.action || '',
            productImageUrl: p.productImageUrl || assignedImgUrl,
            prompt: ensureSocialPromptSlots(rawPrompt, {
              hasHuman: p.has_human,
              hasFace: Boolean(anchorFaceImageUrl),
              socialMode: true,
              expression: p.expression || '',
            }),
          };
        }

        return {
          ...p,
          expression: p.expression || '',
          action: p.action || '',
          prop: p.prop || '',
          optics: p.optics || '',
          productImageUrl: p.productImageUrl || assignedImgUrl,
          // 服务端已拼装；客户端再走一遍确保与圣经一致
          prompt: assembleOriginalShotPrompt(
            {
              identityBible: identityFromApi,
              lookBible: lookFromApi,
              lookParts: lookPartsFromApi || undefined,
              masterScene: masterFromApi,
              styleBible: styleBibleFromApi,
              productRole: productRoleFromApi || undefined,
              productFingerprint: fingerprintFromApi || undefined,
            },
            {
              shot_no: p.shot_no || idx + 1,
              expression: p.expression,
              action: p.action,
              prop: p.prop,
              optics: p.optics,
              camera_focal_length: p.camera_focal_length,
              angle: p.angle,
              lighting_type: p.lighting_type,
              scene: p.scene || masterFromApi,
              title: p.title,
              has_human: p.has_human,
              promptFallback: rawPrompt,
            },
            { hasFace: Boolean(anchorFaceImageUrl) && p.has_human !== false }
          ),
        };
      });

      const diversifiedOriginal = isSocialMode
        ? cleanedPrompts
        : enforceOriginalShotDiversity(cleanedPrompts, cleanedPrompts.some((p: any) => p.has_human !== false)).map(
            (p: any, idx: number) => ({
              ...p,
              prompt: assembleOriginalShotPrompt(
                {
                  identityBible: identityFromApi,
                  lookBible: lookFromApi,
                  lookParts: lookPartsFromApi || undefined,
                  masterScene: masterFromApi,
                  styleBible: styleBibleFromApi,
                  productRole: productRoleFromApi || undefined,
                  productFingerprint: fingerprintFromApi || undefined,
                },
                {
                  shot_no: p.shot_no || idx + 1,
                  expression: p.expression,
                  action: p.action,
                  prop: p.prop,
                  optics: p.optics,
                  camera_focal_length: p.camera_focal_length,
                  angle: p.angle,
                  lighting_type: p.lighting_type,
                  scene: p.scene || masterFromApi,
                  title: p.title,
                  has_human: p.has_human,
                  promptFallback: p.prompt,
                },
                { hasFace: Boolean(anchorFaceImageUrl) && p.has_human !== false }
              ),
            })
          );

      const finalPrompts = (isSocialMode && selectedClonedUrls.length > 0)
        ? cleanedPrompts.slice(0, selectedClonedUrls.length)
        : diversifiedOriginal;

      setGeneratedPrompts(finalPrompts, fingerprintFromApi || data.productFingerprint || data.product_fingerprint, {
        masterScene: masterFromApi,
        lookBible: lookFromApi,
        identityBible: identityFromApi,
        styleBible: styleBibleFromApi,
        lookParts: lookPartsFromApi,
        productRole: productRoleFromApi,
        actionDigest: data.actionDigest,
      });
      if (!isSocialMode) {
        setStyleBible(styleBibleFromApi);
        setLookParts(lookPartsFromApi);
        if (productRoleFromApi) {
          useAppStore.getState().setProductRole(productRoleFromApi);
        }
      }

      // 🌟 记录真实视觉大模型调用用量
      const actualModel = data.modelUsed || selectedVisionModel;
      const modelObj = availableVisionModels.find((m: any) => m.id === actualModel) || VISION_MODELS.find(m => m.id === actualModel);
      if (data.modelSwitched || (actualModel && actualModel !== targetVisionModel)) {
        const hint = `主模型「${targetVisionModel}」不可用，已改用「${actualModel}」完成分析`;
        setAnalysisModelHint(hint);
        showToast(hint);
      } else {
        setAnalysisModelHint(null);
      }
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
      const errMsg = e.message || '视觉大模型分析超时，请重试';
      setAnalysisError(errMsg);
      alert(errMsg);
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
    <div className="flex-1 flex overflow-hidden bg-[#F8F9FA] text-slate-900 select-none">
      {/* Left Sidebar: Vision Parameters Workbench (Enhanced Breathing Room & Luxury Light Theme) */}
      <div className="w-[360px] md:w-[400px] lg:w-[420px] xl:w-[450px] 2xl:w-[480px] flex-shrink-0 bg-white border-r border-slate-200/80 flex flex-col h-full shadow-[2px_0_12px_rgba(0,0,0,0.03)] z-10">
        {/* Top Header */}
        {!hideChromeNav && (
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
                <span>提示词策划</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-medium">配置模型并生成分镜提示词</p>
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
        )}
        {hideChromeNav && (
          <div className="px-5 py-3 border-b border-slate-200/80 flex-shrink-0">
            <h2 className="text-sm font-bold text-slate-900">提示词策划</h2>
          </div>
        )}

        <PromptStudioAnalyzePanel
          onBackToStep1={onBackToStep1}
          workshopMode={workshopMode}
          selectedClonedList={selectedClonedList}
          selectedClonedCount={selectedClonedCount}
          product={product}
          effectiveImages={effectiveImages}
          anchorFaceImageUrl={effectiveAnchorFaceImageUrl ?? null}
          isNoModel={isNoModel}
          availableVisionModels={availableVisionModels}
          selectedVisionModel={selectedVisionModel}
          setSelectedVisionModel={setSelectedVisionModel}
          isModelDropdownOpen={isModelDropdownOpen}
          setIsModelDropdownOpen={setIsModelDropdownOpen}
          modelDropdownRef={modelDropdownRef}
          showAdvancedSettings={showAdvancedSettings}
          setShowAdvancedSettings={setShowAdvancedSettings}
          clonedSocialImages={clonedSocialImages}
          shotCount={shotCount}
          setShotCount={setShotCount}
          extraRequirements={extraRequirements}
          setExtraRequirements={setExtraRequirements}
          onOpenPromptHistory={onOpenPromptHistory}
          handleGeneratePrompts={handleGeneratePrompts}
          isAnalyzing={isAnalyzing}
          generatedPromptsLength={generatedPrompts.length}
          effectiveShotCount={effectiveShotCount}
          stylePickerSlot={
            <PromptStudioStylePicker
              workshopMode={workshopMode}
              customRecipes={customRecipes}
              setCustomRecipes={setCustomRecipes}
              selectedStyleId={selectedStyleId}
              setSelectedStyleId={setSelectedStyleId}
              customStyleText={customStyleText}
              setCustomStyleText={setCustomStyleText}
              isViewingStyleSnippet={isViewingStyleSnippet}
              setIsViewingStyleSnippet={setIsViewingStyleSnippet}
              isEditingStyleSnippet={isEditingStyleSnippet}
              setIsEditingStyleSnippet={setIsEditingStyleSnippet}
              copiedStyleSnippet={copiedStyleSnippet}
              setCopiedStyleSnippet={setCopiedStyleSnippet}
              generatedPromptsLength={generatedPrompts.length}
              showToast={showToast}
              setIsManualArchOpen={setIsManualArchOpen}
              setIsExtractModalOpen={setIsExtractModalOpen}
              setIsRecipeBrowserOpen={setIsRecipeBrowserOpen}
            />
          }
        />
      </div>

      {/* Right Canvas: Shot Cards & Fast Management Workbench */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8F9FA]">
        {/* Top Action Bar */}
        <div className="h-16 px-6 lg:px-8 border-b border-slate-200/80 bg-white flex items-center justify-between flex-shrink-0 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-2xs">
                <Wand2 className="w-3.5 h-3.5" />
              </div>
              <span>分镜提示词</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              {generatedPrompts.length > 0 ? (
                <>已生成 <span className="font-bold text-indigo-600">{generatedPrompts.length}</span> 个 · 已勾选 <span className="font-bold text-emerald-600">{selectedPromptCount}</span> 个</>
              ) : (
                <>配置左侧模型后开始分析</>
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
                  title="批量查找替换"
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
                  title="清洗提示词"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>清洗</span>
                </button>

                <button
                  onClick={handleCopyAll}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                >
                  {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedAll ? '已复制' : '复制全部'}</span>
                </button>

                {!hideChromeNav && (
                <button
                  onClick={() => {
                    initGenerationTasks(false);
                    onNextToStep3();
                  }}
                  disabled={selectedPromptCount === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-40"
                >
                  <span>下一步：生图 ({selectedPromptCount})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                )}
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
          {/* 🌟 视觉分析错误告警看板 */}
          {analysisError && (
            <div className="p-4 rounded-3xl bg-rose-50 border border-rose-200 text-rose-800 shadow-xs flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div className="space-y-1 min-w-0">
                  <h4 className="text-xs font-bold text-rose-900">视觉大模型推理策划失败</h4>
                  <p className="text-xs text-rose-700 leading-relaxed font-mono break-all">{analysisError}</p>
                  <p className="text-[11px] text-rose-600/80 pt-1">
                    可尝试在左侧切换您已配置的其他多模态模型，或检查 API Key 额度与网络。
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAnalysisError(null)}
                className="p-1.5 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-100 transition-colors shrink-0 cursor-pointer"
                title="关闭提示"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {analysisModelHint && !analysisError && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 shadow-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs font-medium leading-relaxed">{analysisModelHint}</p>
              </div>
              <button
                type="button"
                onClick={() => setAnalysisModelHint(null)}
                className="p-1 rounded-lg text-amber-500 hover:bg-amber-100 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {toastMsg && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg max-w-[90vw]">
              {toastMsg}
            </div>
          )}

          {/* 🌟 1. 顶部已挂载商品实物素材与特征感知看板 (增强用户对多模态大模型的感知) */}
          <div className="p-4 rounded-3xl bg-white border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {effectiveImages.length > 0 ? (
                <div className="flex -space-x-2 overflow-hidden shrink-0">
                  {effectiveImages.slice(0, 5).map((img, iIdx) => (
                    <img
                      key={iIdx}
                      src={normalizeImageUrlToStandardJpg(img.url)}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (!target.dataset.hasRetried && img.url) {
                          target.dataset.hasRetried = 'true';
                          target.src = proxyMediaUrl(img.url);
                        }
                      }}
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

          {/* 爆款 / 原创 模式状态条（仅分析完成后） */}
          {generatedPrompts.length > 0 && (workshopMode === 'social_face_product_swap' ? (
            <div className="p-3 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center gap-3">
              {anchorFaceImageUrl && !isNoModel ? (
                <img
                  src={anchorFaceImageUrl}
                  alt=""
                  className="w-9 h-9 rounded-xl object-cover border border-slate-200 flex-shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 border border-indigo-100">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                  <span>爆款复刻已就绪</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                    {isNoModel ? '纯商品' : anchorFaceImageUrl ? '已定脸' : '换脸'}
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500">
                  {isNoModel
                    ? '按参考图构图替换为目标商品'
                    : '姿态跟参考图，表情由提示词，身份跟正脸照'}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-white border border-slate-200 flex flex-wrap items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 border border-indigo-100">
                <Film className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                  <span>原创连拍已就绪</span>
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-100">
                    同人同景同穿搭 · {generatedPrompts.length} 镜差异化
                  </span>
                </h4>
                <p className="text-[11px] text-slate-500 truncate max-w-xl">
                  {masterScene
                    ? `主场景：${masterScene}`
                    : '架构 → 组级锁定 → 各镜表情/动作/机位拉开'}
                </p>
              </div>
            </div>
          ))}

          {/* Extracted Product Appearance Fingerprint — 默认折叠 */}
          {productFingerprint && (
            <details className="p-4 rounded-2xl bg-white border border-slate-200 group">
              <summary className="text-xs font-bold text-slate-800 flex items-center gap-2 cursor-pointer list-none">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                商品外观指纹
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-auto group-open:rotate-180 transition-transform" />
              </summary>
              <div className="mt-3 space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{productFingerprint}</p>
              </div>
            </details>
          )}

          {generatedPrompts.length > 0 ? (
            <>
              <PromptStudioGroupLocks
                workshopMode={workshopMode}
                masterScene={masterScene}
                setMasterScene={setMasterScene}
                identityBible={identityBible}
                setIdentityBible={setIdentityBible}
                lookBible={lookBible}
                setLookBible={setLookBible}
                styleBible={styleBible}
                setStyleBible={setStyleBible}
                productRole={productRole}
                productFingerprint={productFingerprint}
                applyGroupLocksToPrompts={applyGroupLocksToPrompts}
                showToast={showToast}
              />
              <PromptStudioShotList
                generatedPrompts={generatedPrompts}
                workshopMode={workshopMode}
                selectedClonedList={selectedClonedList}
                effectiveImages={effectiveImages}
                anchorFaceImageUrl={effectiveAnchorFaceImageUrl ?? null}
                copiedIndex={copiedIndex}
                toggleShotSelection={toggleShotSelection}
                updateShotPrompt={updateShotPrompt}
                deleteShotPrompt={deleteShotPrompt}
                handleCopy={handleCopy}
                handleRerollSingleShot={handleRerollSingleShot}
                handlePolishSingleShot={handlePolishSingleShot}
              />
            </>
          ) : (
            <PromptStudioEmptyPreview
              workshopMode={workshopMode}
              clonedSocialImages={clonedSocialImages}
              shotCount={shotCount}
              customRecipes={customRecipes}
              selectedStyleId={selectedStyleId}
              product={product}
            />
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
        onRecipesChanged={fetchRecipes}
        onUseManualArchitecture={(result) => {
          setCustomStyleText(result.promptSnippet);
          setIsViewingStyleSnippet(true);
          setIsEditingStyleSnippet(true);
          if (result.recipe?.id) {
            setCustomRecipes((prev) => {
              if (prev.some((r) => r.id === result.recipe.id)) return prev;
              return [result.recipe, ...prev];
            });
            setSelectedStyleId(result.recipe.id);
            if (result.recipe.category) setCategoryTab(result.recipe.category);
          }
          showToast(result.recipe?.id ? '已保存并应用自定义架构' : '已应用粘贴的提示词架构');
        }}
      />

      <ManualArchitecturePanel
        isOpen={isManualArchOpen}
        onClose={() => setIsManualArchOpen(false)}
        initialSnippet={customStyleText}
        onUse={(result) => {
          setCustomStyleText(result.promptSnippet);
          setIsViewingStyleSnippet(true);
          setIsEditingStyleSnippet(true);
          if (result.recipe?.id) {
            setCustomRecipes((prev) => {
              if (prev.some((r) => r.id === result.recipe.id)) return prev;
              return [result.recipe, ...prev];
            });
            setSelectedStyleId(result.recipe.id);
            if (result.recipe.category) setCategoryTab(result.recipe.category);
          } else {
            // 仅立即使用：保持当前配方或切到 auto，以 customStyleText 为准
            if (selectedStyleId === 'auto' || !customRecipes.find((r) => r.id === selectedStyleId)) {
              setSelectedStyleId('auto');
            }
          }
          showToast(result.recipe?.id ? '已保存并应用自定义架构' : '已应用粘贴的提示词架构');
        }}
        onSaved={(recipe) => {
          setCustomRecipes((prev) => {
            if (prev.some((r) => r.id === recipe.id)) return prev;
            return [recipe, ...prev];
          });
        }}
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
