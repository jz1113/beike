'use client';
import { useState, useEffect, useRef } from 'react';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import { IMAGE_GEN_MODELS, ASPECT_RATIOS, cleanPromptText } from '@/lib/drawing';
import { getClientStorageHeaders } from '@/lib/storage';
import { recordModelUsage } from '@/lib/usageTracker';
import { getModelIcon } from '@/components/common/ModelIcons';
import AspectRatioSelector from '@/components/common/AspectRatioSelector';
import AIGeneratingCard from '@/components/common/AIGeneratingCard';
import {
  Sparkles,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Download,
  Copy,
  Check,
  RefreshCw,
  Eye,
  Sliders,
  Layers,
  Cpu,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Maximize2,
  X,
  ExternalLink,
  Zap,
  Info,
  Users,
  Edit3,
  Pencil,
  Save,
  Wand2,
  FileText,
  RotateCcw
} from 'lucide-react';

import { getModelProviderName, getModelBadgeName, getModelAccurateDescription } from '@/components/hub/PromptActionBar';

interface Props {
  onBackToStep2: () => void;
  onNextToStep4: () => void;
}

export default function ImageGenStudio({ onBackToStep2, onNextToStep4 }: Props) {
  const {
    product,
    images,
    generatedPrompts,
    selectedImageGenModel,
    setSelectedImageGenModel,
    selectedAspectId,
    setSelectedAspectId,
    selectedQuality,
    setSelectedQuality,
    useReferenceImage,
    setUseReferenceImage,
    isBatchGenerating,
    setIsBatchGenerating,
    generationTasks,
    initGenerationTasks,
    updateGenerationTask,
    workshopMode,
    modelPersona,
    anchorFaceImageUrl,
    setAnchorFaceImageUrl,
    isAnchorFaceConfirmed,
    setIsAnchorFaceConfirmed
  } = useAppStore();

  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);
  const [activeLightboxTitle, setActiveLightboxTitle] = useState<string>('');
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [availableImageModels, setAvailableImageModels] = useState<any[]>(IMAGE_GEN_MODELS);
  
  // 🌟 提示词查看与精修弹窗状态
  const [editingTask, setEditingTask] = useState<GenerationTask | null>(null);
  const [editingPromptText, setEditingPromptText] = useState<string>('');
  const [originalPromptText, setOriginalPromptText] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const handleOpenPromptEditor = (task: GenerationTask) => {
    setEditingTask(task);
    setEditingPromptText(task.prompt);
    setOriginalPromptText(task.prompt);
  };

  const handleSavePrompt = () => {
    if (!editingTask) return;
    updateGenerationTask(editingTask.id, { prompt: editingPromptText });
    showToast('✨ 提示词已更新保存！');
    setEditingTask(null);
  };

  const handleSaveAndGenerate = async () => {
    if (!editingTask) return;
    updateGenerationTask(editingTask.id, { prompt: editingPromptText });
    const updatedTask = { ...editingTask, prompt: editingPromptText };
    setEditingTask(null);
    showToast('🚀 提示词已更新，立即启动渲染...');
    await handleGenerateSingle(updatedTask);
  };

  const [isReconstructingId, setIsReconstructingId] = useState<string | null>(null);

  // 🌟 即席单分镜 AI 视觉重构微流转 (无需退回 Step 2，原地调用视觉大模型重构机位)
  const handleReconstructShotWithAI = async (task: GenerationTask) => {
    setIsReconstructingId(task.id);
    showToast('✨ AI 视觉总监正在为您重新构想此分镜机位与叙事焦点...');
    try {
      const localUrl = typeof window !== 'undefined' ? localStorage.getItem('ai_base_url') || undefined : undefined;
      const localKey = typeof window !== 'undefined' ? localStorage.getItem('ai_api_key') || undefined : undefined;
      const targetVisionModel = typeof window !== 'undefined'
        ? (localStorage.getItem('ai_multimodal_model') || localStorage.getItem('ai_vision_model') || 'gpt-5.6-luna')
        : 'gpt-5.6-luna';
      const targetProductImage = selectedProductImage?.url || product?.picUrl || (images.length > 0 ? images[0]?.url : undefined);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: product?.title || '指定商品',
          imageUrls: targetProductImage ? [targetProductImage] : [],
          shotCount: 1,
          extraRequirements: `针对分镜【${task.title || '当前分镜'}】，换一个截然不同的全新摄影机位与独特生活动线视角（如：大广角生活空间透视、超低机位贴地延伸、越肩抓拍、微距光影、第一人称沉浸使用等），要求必须为纯中文生图提示词，保持商品物理特征与主空间环境一致。原提示词：${task.prompt}`,
          model: targetVisionModel,
          customBaseUrl: localUrl,
          customApiKey: localKey
        })
      });
      const data = await res.json();
      if (data.success && data.prompts && data.prompts[0]) {
        const newShot = data.prompts[0];
        updateGenerationTask(task.id, {
          title: newShot.title || task.title,
          prompt: newShot.prompt,
          scene: newShot.scene || task.scene
        });
        if (editingTask?.id === task.id) {
          setEditingPromptText(newShot.prompt);
        }
        showToast('🎉 AI 视觉总监已完成机位重构！');
      } else {
        throw new Error(data.error || 'AI 重构失败');
      }
    } catch (e: any) {
      showToast(`❌ 重构失败: ${e.message || '网络连接异常'}`);
    } finally {
      setIsReconstructingId(null);
    }
  };

  const handleAppendKeyword = (keyword: string) => {
    setEditingPromptText(prev => {
      const trimmed = prev.trim();
      if (!trimmed) return keyword;
      if (trimmed.includes(keyword)) return prev;
      return `${trimmed}，${keyword}`;
    });
  };

  const pollingRef = useRef<{ [taskId: string]: boolean }>({});

  // 加载自定义/拉取的生图模型
  useEffect(() => {
    const loadCustomImageModels = () => {
      const savedCustom = localStorage.getItem('custom_models');
      if (savedCustom) {
        try {
          const parsed = JSON.parse(savedCustom);
          const customImg = parsed.filter((m: any) => m.isImage).map((m: any) => ({
            id: m.id,
            name: m.name || m.id,
            provider: getModelProviderName(m.id, m.name || m.id, m.provider),
            badge: getModelBadgeName(m.id, m.name || m.id, m.badge),
            description: getModelAccurateDescription(m.id, m.name || m.id, m.desc || m.description),
            modelId: m.id,
            isPrimary: false
          }));
          if (customImg.length > 0) {
            setAvailableImageModels(customImg);
          }
        } catch (e) {}
      }
    };

    loadCustomImageModels();
    window.addEventListener('models_updated', loadCustomImageModels);
    return () => window.removeEventListener('models_updated', loadCustomImageModels);
  }, []);

  // 选中的用于生图的底图
  const selectedProductImage = images.find(img => img.selected) || images[0];

  // 初始化生图任务列表（确保分镜数量与任务槽位 100% 同步）
  useEffect(() => {
    const selectedPrompts = generatedPrompts.filter(p => p.selected !== false);
    const effectiveCount = selectedPrompts.length > 0 ? selectedPrompts.length : generatedPrompts.length;
    if (effectiveCount > 0 && (generationTasks.length === 0 || generationTasks.length !== effectiveCount)) {
      initGenerationTasks();
    }
  }, [generatedPrompts, generationTasks.length, initGenerationTasks]);

  // 轮询单个任务状态
  const pollTaskStatus = async (taskId: string, internalId: string) => {
    if (pollingRef.current[taskId]) return;
    pollingRef.current[taskId] = true;

    let attempts = 0;
    const maxAttempts = 60; // 最多轮询 120 秒

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2500));
      attempts++;

      try {
        const localUrl = typeof window !== 'undefined' ? localStorage.getItem('ai_base_url') || '' : '';
        const localKey = typeof window !== 'undefined' ? localStorage.getItem('ai_api_key') || '' : '';
        const queryParams = new URLSearchParams({ taskId });
        if (localUrl) queryParams.set('customBaseUrl', localUrl);
        if (localKey) queryParams.set('customApiKey', localKey);

        const res = await fetch(`/api/generate-image?${queryParams.toString()}`, {
          headers: getClientStorageHeaders()
        }).catch(() => null);
        if (!res || !res.ok) continue;
        const data = await res.json().catch(() => null);

        if (data?.success) {
          updateGenerationTask(internalId, {
            status: data.status,
            progress: data.progress || `${Math.min(attempts * 5, 95)}%`,
            resultUrl: data.resultUrl,
            failReason: data.failReason
          });

          if (data.status === 'SUCCESS' || data.status === 'FAILURE') {
            if (data.status === 'SUCCESS' && data.resultUrl) {
              const currentTasks = useAppStore.getState().generationTasks;
              const currentAnchor = useAppStore.getState().anchorFaceImageUrl;
              if (currentTasks[0]?.id === internalId && useAppStore.getState().workshopMode === 'social_face_product_swap' && !currentAnchor) {
                setAnchorFaceImageUrl(data.resultUrl);
              }
            }
            pollingRef.current[taskId] = false;
            break;
          }
        }
      } catch (err) {
        console.warn('轮询状态异常:', err);
      }
    }
    pollingRef.current[taskId] = false;
  };

  // 启动单个分镜生图
  const handleGenerateSingle = async (task: GenerationTask) => {
    updateGenerationTask(task.id, {
      status: 'IN_PROGRESS',
      progress: '提交渲染中...',
      resultUrl: undefined,
      failReason: undefined
    });

    const localUrl = typeof window !== 'undefined' ? localStorage.getItem('ai_base_url') || undefined : undefined;
    const localKey = typeof window !== 'undefined' ? localStorage.getItem('ai_api_key') || undefined : undefined;

    const isFirstShot = generationTasks[0]?.id === task.id;
    const hasHuman = task.has_human !== false;
    // 🌟 若用户已上传真人模特正脸照，则第 1 镜到第 N 镜全量继承该正脸照；若未上传，则第 1 镜定脸后后续镜头继承
    const passAnchorFace = hasHuman ? anchorFaceImageUrl : undefined;

    const isSocialMode = useAppStore.getState().workshopMode === 'social_face_product_swap';

    // 🌟 场景环境与配件定桩图 (仅在原创工坊模式下生效；在爆款复刻模式下每个分镜自身都有严格的参考图，严禁跨分镜污染)
    const currentAllTasks = useAppStore.getState().generationTasks;
    const firstShotTask = currentAllTasks[0];
    const passSceneAnchor = (!isSocialMode && !isFirstShot && firstShotTask?.status === 'SUCCESS' && firstShotTask?.resultUrl)
      ? firstShotTask.resultUrl
      : undefined;

    // 🌟 核心权重与多角度商品图片智能匹配（本分镜绑定的实物图最高优先）：
    // 检查当前分镜是否为背壳/背面/后背视角
    const isBackViewShot = /背壳|背面|后背|背部|后侧|背面装甲|转轴|接口/i.test((task.prompt || '') + ' ' + (task.title || '') + ' ' + (task.scene || ''));
    
    let targetProductImage = task.productImageUrl || selectedProductImage?.url || product?.picUrl || (images.length > 0 ? images[0]?.url : undefined);
    
    // 如果未显式绑定且为背壳/后背分镜，且素材库中有多张商品图，智能优先选择非第 1 张的图（通常为背面/细节图）
    if (!task.productImageUrl && isBackViewShot && images.length > 1) {
      const backCandidate = images.find((img, idx) => idx > 0 && img.url) || images[images.length - 1];
      if (backCandidate?.url) {
        targetProductImage = backCandidate.url;
      }
    }
    
    // 🌟 核心防人脸污染铁律：
    // 当为有人物分镜且已有专属模特人脸 (passAnchorFace) 时：
    // 严禁将含有旧模特人脸的社媒原图 (task.referenceImageUrl) 传入生图模型作为图片参考！
    // 因为生图模型会优先提取旧参考图中的人脸与发型，导致整套图人脸不一致；
    // 此时生图模型仅接收：[目标商品实物图, 专属模特正脸图]；构图与动作全由 Step 2 生成的高保真中文提示词精准驱动！
    // 仅在纯静物分镜 (hasHuman === false) 或未绑定人脸时才传递静物参考图。
    const socialRefImage = (hasHuman && passAnchorFace) ? undefined : task.referenceImageUrl;

    // 在爆款复刻模式下：
    // 1. targetProductImage 是要换上去的目标商品实物图 -> 必须放在首位作为实物核心主体（确保模型锁定商品外观）
    // 2. socialRefImage 是当前分镜要复刻的对标图 (包含桌搭环境、机位构图、光影) -> 放在次位作为构图/光影/置景参考
    // 3. passAnchorFace 是模特人脸 (若有人物)
    // 🚨 严禁塞入商品库里的其他京东营销海报 (images.slice(0, 2))，严禁跨分镜场景污染
    const multiReferenceImages = isSocialMode
      ? [
          targetProductImage,
          socialRefImage,
          passAnchorFace
        ].filter(Boolean) as string[]
      : [
          targetProductImage,
          ...images.map(img => img.url).filter(u => u && u !== targetProductImage).slice(0, 2),
          passAnchorFace,
          passSceneAnchor,
          socialRefImage
        ].filter(Boolean) as string[];

    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getClientStorageHeaders()
        },
        body: JSON.stringify({
          prompt: task.prompt,
          model: selectedImageGenModel,
          aspectRatio: selectedAspectId,
          quality: selectedQuality || 'high',
          productImageUrl: targetProductImage,
          socialReferenceImageUrl: socialRefImage,
          referenceImageUrl: targetProductImage || socialRefImage,
          sceneAnchorImageUrl: passSceneAnchor,
          images: multiReferenceImages,
          referenceImages: multiReferenceImages,
          anchorFaceImageUrl: passAnchorFace,
          has_human: task.has_human,
          shot_type: task.shot_type,
          productTitle: product?.title || '电商商品',
          customBaseUrl: localUrl,
          customApiKey: localKey
        })
      }).catch(() => null);

      if (!res) {
        throw new Error('网络连接异常，请检查网络设置');
      }

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `生成请求失败 (HTTP ${res.status})`);
      }

      // 🌟 记录工坊真实模型调用
      const currentGenModelConfig = IMAGE_GEN_MODELS.find(m => m.id === selectedImageGenModel);
      recordModelUsage({
        modelId: selectedImageGenModel,
        modelName: currentGenModelConfig?.name || selectedImageGenModel,
        provider: currentGenModelConfig?.provider || (selectedImageGenModel.includes('seedream') ? '字节即梦' : selectedImageGenModel.includes('grok') ? 'xAI' : selectedImageGenModel.includes('gemini') ? 'Google' : 'OpenAI'),
        type: 'image',
        mediaCount: 1,
        success: true
      });

      if (data.resultUrl) {
        // 同步直接完成
        updateGenerationTask(task.id, {
          status: 'SUCCESS',
          progress: '100%',
          resultUrl: data.resultUrl,
          taskId: data.taskId
        });
        if (isFirstShot && workshopMode === 'social_face_product_swap' && !anchorFaceImageUrl) {
          setAnchorFaceImageUrl(data.resultUrl);
        }
      } else if (data.taskId) {
        // 异步任务进入轮询
        updateGenerationTask(task.id, {
          status: 'IN_PROGRESS',
          progress: '正在排队渲染中...'
        });
        pollTaskStatus(data.taskId, task.id);
      }
    } catch (err: any) {
      console.error('生图异常:', err);
      updateGenerationTask(task.id, {
        status: 'FAILURE',
        failReason: err?.message || '生成请求未成功完成'
      });
    }
  };

  // 一键批量启动生图 (支持自动重置与全量并发生成)
  const handleBatchGenerate = async () => {
    let currentTasks = useAppStore.getState().generationTasks;
    
    // 如果所有分镜均已出图，点击全部重新生成时，自动重置全部任务状态并全量重新跑
    const allFinished = currentTasks.length > 0 && currentTasks.every(t => t.status === 'SUCCESS');
    if (allFinished) {
      initGenerationTasks(true);
      currentTasks = useAppStore.getState().generationTasks;
    }

    setIsBatchGenerating(true);
    const isNoModel = !modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物');
    const hasAnyHuman = !isNoModel && currentTasks.some(t => t.has_human === true || (t.has_human !== false && (t.shot_type === 'model_shot' || !t.shot_type)));

    if (hasAnyHuman) {
      if (!isAnchorFaceConfirmed && !anchorFaceImageUrl) {
        // 仅在未提供固定真人人脸时，才需要两阶段定脸（先生成分镜 1）
        if (currentTasks[0]) {
          await handleGenerateSingle(currentTasks[0]);
        }
      } else {
        // 已绑定专属真人人脸或已确立基准面孔：全量并发生成所有待完成分镜（包含分镜 1）
        const uncompletedTasks = currentTasks.filter(t => t.prompt && t.status !== 'SUCCESS');
        await Promise.all(uncompletedTasks.map(task => handleGenerateSingle(task)));
      }
    } else {
      // 纯静物/纯商品/桌搭模式：
      // 🌟 场景与配件强一致性机制 (首图定景)：
      // 若分镜 1 尚未生成成功且总任务数 > 1，先渲染分镜 1 作为【场景环境基准底图 (Scene Anchor)】；
      // 一旦分镜 1 生成出图，自动将其作为桌面/键盘/鼠标/水杯的视觉基准底图，并发渲染分镜 2~N！
      // 若分镜 1 已经生成成功，则直接并发渲染剩余未完成的分镜！
      const firstTask = currentTasks[0];
      if (firstTask && firstTask.status !== 'SUCCESS') {
        await handleGenerateSingle(firstTask);
        // 分镜 1 渲染完成，刷新状态后获取最新的 tasks
        const updatedTasks = useAppStore.getState().generationTasks;
        const restTasks = updatedTasks.slice(1).filter(t => t.prompt && t.status !== 'SUCCESS');
        if (restTasks.length > 0) {
          await Promise.all(restTasks.map(task => handleGenerateSingle(task)));
        }
      } else {
        const uncompleted = currentTasks.filter(t => t.prompt && t.status !== 'SUCCESS');
        await Promise.all(uncompleted.map(task => handleGenerateSingle(task)));
      }
    }
    setIsBatchGenerating(false);
  };

  const handleCopyPrompt = (prompt: string, taskId: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedTaskId(taskId);
    setTimeout(() => setCopiedTaskId(null), 2000);
  };

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.jpg`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const successCount = generationTasks.filter(t => t.status === 'SUCCESS').length;
  const inProgressCount = generationTasks.filter(t => t.status === 'IN_PROGRESS').length;
  const totalCount = generationTasks.length;

  return (
    <div className="flex-1 flex overflow-hidden bg-[#F8F9FC] text-slate-900 select-none">
      {/* Left Sidebar: Image Gen Engine Workbench */}
      <div className="w-[360px] md:w-[380px] lg:w-[400px] xl:w-[420px] 2xl:w-[440px] flex-shrink-0 bg-white border-r border-slate-200/80 flex flex-col h-full overflow-y-auto p-5 space-y-6 shadow-[2px_0_12px_rgba(0,0,0,0.03)] z-10">
        {/* Header Navigation */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToStep2}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
              title="返回提示词策划"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <h2 className="text-xs font-bold text-slate-900">AI 渲染引擎参数</h2>
          </div>
        </div>

        {/* Reference Image Anchor */}
        <div className="p-3.5 rounded-2xl bg-indigo-50/40 border border-indigo-100 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
            <span className="flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
              商品外观对齐底图
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-600 font-medium">
              <input
                type="checkbox"
                checked={useReferenceImage}
                onChange={e => setUseReferenceImage(e.target.checked)}
                className="rounded accent-indigo-600 cursor-pointer w-3.5 h-3.5"
              />
              <span>垫图控形</span>
            </label>
          </div>

          {selectedProductImage && (
            <div className="flex items-center gap-3">
              <img
                src={selectedProductImage.url}
                alt=""
                className="w-12 h-12 rounded-xl object-cover bg-white border border-slate-200 flex-shrink-0 shadow-sm"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-800 truncate">
                  {product?.title || '当前工作商品'}
                </div>
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  已绑定为生图一致性视觉锚点
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 🌟 场景环境与道具定桩状态展示 */}
        {generationTasks[0]?.status === 'SUCCESS' && generationTasks[0]?.resultUrl && (
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-950">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>🔗 场景环境与道具定桩 (已锁定)</span>
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono font-bold">
                首图定景
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <img
                src={generationTasks[0].resultUrl}
                alt="Scene Anchor"
                className="w-11 h-11 rounded-lg object-cover bg-white border border-emerald-300 flex-shrink-0 shadow-2xs"
              />
              <p className="text-[11px] text-emerald-800 leading-snug">
                已将分镜 1 的桌面材质、机械键盘、鼠标、水杯与光影锁定为全套基准，后续分镜渲染将强制保持道具一致！
              </p>
            </div>
          </div>
        )}

        {/* Image Generation Model Matrix */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-600" />
            生图大模型
          </label>
          <div className="space-y-1.5 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 max-h-56 overflow-y-auto">
            {availableImageModels.map(m => {
              const isSelected = selectedImageGenModel === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedImageGenModel(m.id)}
                  className={`px-3.5 py-2 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-white border-indigo-300 text-indigo-900 shadow-sm font-bold ring-1 ring-indigo-500/20'
                      : 'bg-transparent border-transparent text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={isSelected ? 'text-indigo-600' : 'text-slate-400'}>
                      {getModelIcon(m.id, "w-4 h-4")}
                    </div>
                    <span className="text-xs truncate">{m.name}</span>
                  </div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-indigo-600 shadow-[0_0_6px_rgba(99,102,241,0.8)] flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-pink-600" />
            图片比例
          </label>
          <AspectRatioSelector
            selectedId={selectedAspectId}
            onSelect={setSelectedAspectId}
          />
        </div>

        {/* Quality Selector (low, medium, high) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-600" />
              生图质量
            </span>
            <span className="text-[10px] font-mono font-bold text-indigo-600 uppercase bg-indigo-50 px-1.5 py-0.5 rounded">
              {selectedQuality}
            </span>
          </label>
          <div className="bg-slate-100/90 p-1 rounded-2xl flex items-center gap-1 border border-slate-200/80">
            {[
              { id: 'low', label: 'low' },
              { id: 'medium', label: 'medium ✦' },
              { id: 'high', label: 'high ✦' }
            ].map(q => {
              const isSelected = selectedQuality === q.id;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedQuality(q.id as any)}
                  className={`flex-1 py-2 text-xs font-mono font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>{q.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right Main Canvas: Image Generation Matrix */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F8F9FC]">
        {/* Top Action Bar */}
        <div className="h-16 px-6 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl flex items-center justify-between flex-shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              AI 种草买家秀生图画布 (异步渲染)
            </h3>
            <p className="text-[11px] text-slate-500">
              共 {totalCount} 个分镜 · 成功已出图 {successCount} 张 · 渲染中 {inProgressCount} 张
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {successCount > 0 && (
              <button
                type="button"
                onClick={() => initGenerationTasks(true)}
                className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
                title="清空画布与旧图，重置所有分镜为待生成状态"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={handleBatchGenerate}
              disabled={isBatchGenerating || generationTasks.length === 0}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm ${
                successCount === 0
                  ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white shadow-indigo-500/20'
                  : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
              }`}
            >
              {isBatchGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : successCount === 0 ? (
                <Zap className="w-3.5 h-3.5 text-amber-300" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>
                {isBatchGenerating
                  ? `正在极速渲染 (${inProgressCount}/${totalCount})...`
                  : successCount === 0
                  ? `一键批量启动生图 (${totalCount} 张)`
                  : '全部重新生成'}
              </span>
            </button>

            <button
              onClick={onNextToStep4}
              disabled={successCount === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-md disabled:opacity-40 cursor-pointer"
            >
              <span>下一步：打包交付 ({successCount})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tasks Gallery Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto pb-24">
            {/* 智能分支交互卡片：有模特场景展示两阶段定脸卡片；纯静物场景展示全量并发卡片 */}
            {generationTasks.length > 0 && (() => {
              const isNoModel = !modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物');
              const hasAnyHuman = !isNoModel && generationTasks.some(t => t.has_human === true || (t.has_human !== false && (t.shot_type === 'model_shot' || !t.shot_type)));
              const task1 = generationTasks[0];

              if (!hasAnyHuman) {
                return (
                  <div className="mb-6 p-4 rounded-3xl bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 border border-slate-200/90 flex items-center justify-between gap-4 shadow-2xs animate-fade-in">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                          <span>📦 纯商品 / 高颜值静物模式</span>
                          <span className="px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            免定脸 · 全量并发
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          本组分镜聚焦商品外观工艺、光影置景与生活使用，无人物模特阻隔，可直接一键全量并发极速渲染。
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleBatchGenerate}
                      disabled={isBatchGenerating}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 cursor-pointer flex items-center gap-1.5 flex-shrink-0 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isBatchGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      <span>🚀 一键全量并发生成全部 ({generationTasks.length} 张)</span>
                    </button>
                  </div>
                );
              }

              if (!isAnchorFaceConfirmed) {
                if (task1?.status === 'SUCCESS' && task1.resultUrl) {
                  return (
                    <div className="mb-6 p-4.5 rounded-3xl bg-gradient-to-r from-pink-50 via-rose-50 to-purple-50 border-2 border-pink-300 shadow-sm space-y-3 animate-fade-in">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-pink-500 animate-ping" />
                          <span className="text-xs sm:text-sm font-extrabold text-pink-950">
                            🎯 阶段一已完成：首图模特人脸已出图！请确认是否锁定为全套基准面孔
                          </span>
                        </div>
                        <span className="text-[11px] text-pink-700 font-bold bg-pink-100 px-2 py-0.5 rounded-md">
                          锁定后后续分镜将 100% 保持同一个人脸
                        </span>
                      </div>

                      <div className="flex items-center gap-4 bg-white/95 p-3.5 rounded-2xl border border-pink-200">
                        <img 
                          src={task1.resultUrl} 
                          alt="首图人脸" 
                          className="w-20 h-20 rounded-xl object-cover border-2 border-pink-300 shadow-xs flex-shrink-0 cursor-pointer"
                          onClick={() => {
                            setActiveLightboxImage(task1.resultUrl || '');
                            setActiveLightboxTitle('分镜 1 模特基准面孔');
                          }}
                        />
                        <div className="flex-1 space-y-1">
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>分镜 1 模特基准面孔</span>
                            <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-bold border border-emerald-200">
                              出图成功
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 leading-relaxed">
                            点击「✨ 确认此人脸」后，系统将把此面孔作为绝对一致性垫图，一键并发生成后续所有分镜！如果对面孔不满意可点击「🔄 重新定脸」。
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setAnchorFaceImageUrl(task1.resultUrl);
                              setIsAnchorFaceConfirmed(true);
                            }}
                            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 cursor-pointer flex items-center gap-1.5 active:scale-95 transition-all"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>✨ 确认此人脸（锁定为全套基准）</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleGenerateSingle(task1)}
                            className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>🔄 重新定脸</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="mb-6 p-4.5 rounded-3xl bg-gradient-to-r from-pink-50/90 to-rose-50/60 border border-pink-200 flex items-center justify-between gap-4 animate-fade-in shadow-2xs">
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-pink-100 border border-pink-200 flex items-center justify-center text-pink-600 flex-shrink-0">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs sm:text-sm font-bold text-pink-950 flex items-center gap-2">
                            <span>🎯 阶段一：首图模特新人脸定模与基准确立</span>
                            <span className="px-2 py-0.2 rounded-full bg-pink-200/80 text-pink-800 text-[10px] font-bold">
                              第 1 步
                            </span>
                          </div>
                          <div className="text-[11px] text-pink-700 mt-0.5 leading-relaxed">
                            包含模特出镜场景，请先点击右侧按钮生成【分镜 1】。出图确认面孔后，系统将一键批量并发生成后续所有分镜，确保 100% 同一个人。
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => task1 && handleGenerateSingle(task1)}
                        disabled={task1?.status === 'IN_PROGRESS'}
                        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 via-rose-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white text-xs font-bold shadow-md shadow-pink-500/20 cursor-pointer flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 transition-all active:scale-95"
                      >
                        {task1?.status === 'IN_PROGRESS' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        <span>{task1?.status === 'IN_PROGRESS' ? '正在渲染首图人脸...' : '🚀 先生成分镜 1 (确定新人脸)'}</span>
                      </button>
                    </div>
                  );
                }
              } else {
                return (
                  <div className="mb-6 p-4.5 rounded-3xl bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 border border-emerald-300 flex items-center justify-between gap-4 shadow-2xs animate-fade-in">
                    <div className="flex items-center gap-3.5">
                      <img 
                        src={anchorFaceImageUrl} 
                        alt="基准人脸" 
                        className="w-12 h-12 rounded-xl object-cover border-2 border-emerald-400 shadow-xs flex-shrink-0 cursor-pointer"
                        onClick={() => {
                          setActiveLightboxImage(anchorFaceImageUrl || '');
                          setActiveLightboxTitle('已绑定的模特基准面孔');
                        }}
                      />
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-emerald-950 flex items-center gap-2">
                          <span>🔒 专属真人模特面容已锁定！全套 100% 保持同一人</span>
                          <span className="px-2 py-0.2 rounded-full bg-emerald-200 text-emerald-800 text-[10px] font-bold">
                            已绑定
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-700 mt-0.5">
                          所有分镜将 100% 直接以此真人模特面孔作为人脸克隆垫图，无需重新定脸，支持一键全量并发生成。
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setAnchorFaceImageUrl(undefined);
                          setIsAnchorFaceConfirmed(false);
                        }}
                        className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-emerald-200 text-emerald-800 text-xs font-medium cursor-pointer transition-colors"
                      >
                        更换人脸
                      </button>
                      <button
                        type="button"
                        onClick={handleBatchGenerate}
                        disabled={isBatchGenerating}
                        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20 cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        {isBatchGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                        <span>⚡ 一键全量并发生成全部 ({generationTasks.length} 张)</span>
                      </button>
                    </div>
                  </div>
                );
              }
            })()}

            {/* Modern Clean Minimalist Gallery Grid (纯净无杂质沉浸画廊) */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6 pb-24">
            {generationTasks.map((task, idx) => (
              <div
                key={task.id}
                className={`relative group rounded-3xl overflow-hidden border-2 transition-all duration-500 bg-white shadow-md hover:shadow-xl flex flex-col justify-between ${
                  selectedAspectId === '1:1' ? 'aspect-square' :
                  selectedAspectId === '9:16' ? 'aspect-[9/16]' :
                  selectedAspectId === '16:9' ? 'aspect-[16/9]' :
                  selectedAspectId === '4:3' ? 'aspect-[4/3]' :
                  selectedAspectId === '2:3' ? 'aspect-[2/3]' :
                  selectedAspectId === '3:2' ? 'aspect-[3/2]' :
                  selectedAspectId === '21:9' ? 'aspect-[21/9]' :
                  'aspect-[3/4]'
                } ${
                  task.status === 'IN_PROGRESS'
                    ? 'border-indigo-500 ring-4 ring-indigo-500/20 shadow-xl'
                    : task.status === 'SUCCESS'
                    ? 'border-slate-200 hover:border-indigo-400 hover:shadow-lg'
                    : task.status === 'FAILURE'
                    ? 'border-red-300 ring-2 ring-red-500/10'
                    : 'border-slate-200 hover:border-indigo-400 hover:shadow-md'
                }`}
              >
                {/* 🌟 极简顶部微标 (保留 SHOT 序号、实物垫图微缩图与状态点) */}
                <div className="absolute top-3.5 inset-x-3.5 z-20 flex items-center justify-between pointer-events-none">
                  <div className="flex items-center gap-1.5 pointer-events-auto">
                    <span className="px-2.5 py-1 rounded-xl bg-slate-900/80 backdrop-blur-md text-white font-mono text-xs font-bold shadow-xs border border-white/10">
                      SHOT {task.shotNo || idx + 1}
                    </span>
                    {task.productImageUrl && (
                      <div 
                        className="w-6 h-6 rounded-lg overflow-hidden border border-white/60 shadow-xs bg-black/40 backdrop-blur-sm cursor-pointer hover:scale-110 transition-transform"
                        title="点击查看本分镜绑定的商品实物图 (生图模型将严格以此图作为实物参考)"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveLightboxImage(task.productImageUrl!);
                          setActiveLightboxTitle(`分镜 ${task.shotNo || idx + 1} 绑定的商品实物图`);
                        }}
                      >
                        <img src={task.productImageUrl} alt="实物垫图" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 pointer-events-auto">
                    <span className={`px-2.5 py-1 rounded-xl text-[10.5px] font-bold flex items-center gap-1 backdrop-blur-md shadow-xs border ${
                      task.status === 'SUCCESS'
                        ? 'bg-emerald-500 text-white border-emerald-400/40 shadow-xs'
                        : task.status === 'IN_PROGRESS'
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white border-indigo-400/40 shadow-xs animate-pulse'
                        : task.status === 'FAILURE'
                        ? 'bg-red-500 text-white border-red-400/40'
                        : 'bg-white/90 text-slate-600 border-slate-200 shadow-2xs'
                    }`}>
                      {task.status === 'SUCCESS' && <CheckCircle2 className="w-3 h-3 text-white" />}
                      {task.status === 'IN_PROGRESS' && <Loader2 className="w-3 h-3 animate-spin text-indigo-100" />}
                      <span>{task.status === 'SUCCESS' ? '已生成' : task.status === 'IN_PROGRESS' ? '渲染中' : task.status === 'FAILURE' ? '失败' : '待生成'}</span>
                    </span>
                  </div>
                </div>

                {/* 🌟 主画面画布（100% 满版纯净展示，无常驻遮挡） */}
                <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden bg-gradient-to-b from-white via-slate-50 to-indigo-50/20">
                  {task.status === 'SUCCESS' && task.resultUrl ? (
                    <>
                      <img
                        src={task.resultUrl}
                        alt={task.title}
                        onClick={() => {
                          setActiveLightboxImage(task.resultUrl!);
                          setActiveLightboxTitle(task.title);
                        }}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-pointer"
                      />

                      {/* 🌟 仅在鼠标悬停时平滑浮现的现代毛玻璃快捷工具栏 (Hover Actions) */}
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-xs flex flex-col justify-between p-4 z-10 pointer-events-none">
                        {/* 顶部标题与提示词简览 */}
                        <div className="pt-10 flex flex-col space-y-1 pointer-events-auto">
                          <div className="text-xs font-bold text-white truncate drop-shadow-sm">
                            {task.title}
                          </div>
                          <div 
                            onClick={() => handleOpenPromptEditor(task)}
                            className="text-[11px] text-slate-300 font-mono line-clamp-2 hover:text-indigo-200 transition-colors cursor-pointer"
                            title="点击查看/精修完整提示词"
                          >
                            {cleanPromptText(task.prompt)}
                          </div>
                        </div>

                        {/* 底部悬浮操作按钮组 */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/15 pointer-events-auto">
                          <div className="flex items-center gap-1.5">
                            {/* 换机位 */}
                            <button
                              type="button"
                              disabled={isReconstructingId === task.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReconstructShotWithAI(task);
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-indigo-600 text-white border border-white/20 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                              title="调用视觉大模型重新规划此分镜机位"
                            >
                              {isReconstructingId === task.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Wand2 className="w-3 h-3 text-indigo-300" />
                              )}
                              <span>AI换机位</span>
                            </button>

                            {/* 编辑词 */}
                            <button
                              type="button"
                              onClick={() => handleOpenPromptEditor(task)}
                              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/30 text-white border border-white/20 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                              title="精修提示词"
                            >
                              <Pencil className="w-3 h-3 text-indigo-300" />
                              <span>编辑词</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* 查看大图 */}
                            <button
                              type="button"
                              onClick={() => {
                                setActiveLightboxImage(task.resultUrl!);
                                setActiveLightboxTitle(task.title);
                              }}
                              className="p-1.5 rounded-xl bg-white/15 hover:bg-white/30 text-white border border-white/20 text-xs transition-all cursor-pointer active:scale-95 shadow-sm"
                              title="全屏大图预览"
                            >
                              <Maximize2 className="w-4 h-4 text-white" />
                            </button>

                            {/* 下载 */}
                            <button
                              type="button"
                              onClick={() => handleDownload(task.resultUrl!, `buyer_show_shot_${task.shotNo}`)}
                              className="p-1.5 rounded-xl bg-white/15 hover:bg-emerald-600 text-white border border-white/20 text-xs transition-all cursor-pointer active:scale-95 shadow-sm"
                              title="下载高清原图"
                            >
                              <Download className="w-4 h-4 text-emerald-300" />
                            </button>

                            {/* 单张重新生成 */}
                            <button
                              type="button"
                              onClick={() => handleGenerateSingle(task)}
                              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-md"
                              title="重新渲染此分镜"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-white" />
                              <span>重生</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : task.status === 'IN_PROGRESS' ? (
                    <AIGeneratingCard task={task} isVideo={false} embedded={true} className="w-full h-full" />
                  ) : task.status === 'FAILURE' ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 text-red-500 animate-fade-in z-10">
                      <AlertCircle className="w-10 h-10 opacity-80 text-red-500" />
                      <div className="text-xs font-bold text-slate-800">渲染遇到异常</div>
                      <div className="text-[11px] text-red-500 font-mono max-w-xs line-clamp-2">{task.failReason}</div>
                      <button
                        type="button"
                        onClick={() => handleGenerateSingle(task)}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                      >
                        重试生成
                      </button>
                    </div>
                  ) : (
                    /* 🌟 优雅摄影工坊待启动取景视图 (Studio Viewfinder Idle State) */
                    <div 
                      onClick={() => handleGenerateSingle(task)}
                      className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center cursor-pointer group/idle z-10 transition-all select-none bg-gradient-to-b from-white via-slate-50 to-indigo-50/20"
                    >
                      {/* Viewfinder Corner Brackets */}
                      <div className="absolute inset-5 pointer-events-none flex flex-col justify-between text-slate-300 group-hover/idle:text-indigo-500 transition-colors">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span>⌜</span>
                          <span>⌝</span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span>⌞</span>
                          <span>⌟</span>
                        </div>
                      </div>

                      {/* Ambient Grid Lines */}
                      <div className="absolute inset-8 border border-slate-200/40 group-hover/idle:border-indigo-500/20 pointer-events-none grid grid-cols-3 grid-rows-3 transition-colors" />

                      {/* Center Interactive Aperture Orb */}
                      <div className="relative p-1 rounded-3xl group-hover/idle:bg-gradient-to-tr group-hover/idle:from-indigo-500 group-hover/idle:via-purple-500 group-hover/idle:to-pink-500 transition-all duration-300 shadow-md">
                        <div className="w-14 h-14 rounded-3xl bg-white border border-slate-200 group-hover/idle:border-transparent flex items-center justify-center text-indigo-600 group-hover/idle:scale-105 transition-all shadow-xs">
                          <Zap className="w-7 h-7 text-indigo-600 group-hover/idle:text-amber-500 transition-colors" />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col items-center space-y-1">
                        <div className="px-3 py-1 rounded-full bg-white group-hover/idle:bg-indigo-600 text-slate-700 group-hover/idle:text-white border border-slate-200 group-hover/idle:border-indigo-600 text-xs font-bold transition-all shadow-xs">
                          ⚡ 待启动渲染 · 点击立即生成
                        </div>
                        <div className="text-[10.5px] text-slate-400 font-mono group-hover/idle:text-slate-600 transition-colors">
                          点击卡片或顶部一键全量并发启动
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>

      {/* 🌟 提示词查看与精修弹窗 (Prompt Inspector & Editor Modal) */}
      {editingTask && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setEditingTask(null)}
        >
          <div 
            className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col p-6 space-y-4 animate-scale-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0 shadow-2xs">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                      SHOT {editingTask.shotNo || 1}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 truncate">
                      {editingTask.title || '分镜提示词精修'}
                    </h3>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    直接微调修改此分镜的 AI 渲染描述词，随时随地定制画面构图与光影细节
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Enhancement Tags */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>一键注入电商高质感关键词 (点击追加)：</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { label: '🚫 严格双臂防3只手', text: '全景严格仅见左手与右手两只手臂与双手，双手共10根手指，严禁多出第三只手臂与悬空手' },
                  { label: '🪞 低机位对镜自拍', text: '低机位对镜自拍镜面反射视角，左手单手在镜前握持手机对镜拍摄，右手自然抬起搭在后脑发丝处' },
                  { label: '📱 手机实拍微噪点', text: '真实手机后置主摄拍摄，轻微自然噪点颗粒感，超高清实拍质感' },
                  { label: '💡 柔和窗边自然光', text: '窗边柔和自然漫射光，通透立体光影，无刺眼高光，色彩温润' },
                  { label: '🌿 真实皮肤毛孔', text: '皮肤清透带有真实毛孔微纹理，发丝细节清晰自然，无塑料磨皮感' },
                  { label: '☕ 生活化日常摆拍', text: '生活化真实桌面场景，随性摆放，富有生活烟火气息，非商业摄影棚假图' },
                  { label: '🔍 浅景深背景微虚化', text: '大光圈浅景深，主体轮廓清晰锐利，背景自然柔和虚化' }
                ].map((chip, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleAppendKeyword(chip.text)}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 border border-slate-200/80 text-[11px] font-medium text-slate-700 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea Editor */}
            <div className="relative">
              <textarea
                value={editingPromptText}
                onChange={e => setEditingPromptText(e.target.value)}
                rows={6}
                placeholder="输入或修改分镜提示词..."
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-xs sm:text-sm text-slate-800 font-mono leading-relaxed outline-none transition-all resize-y min-h-[140px]"
              />
              <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 font-mono bg-white/90 px-2 py-0.5 rounded-md border border-slate-200/60 shadow-2xs">
                {editingPromptText.length} 字符
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(editingPromptText);
                    showToast('📋 提示词已复制到剪贴板');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制词</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingPromptText(originalPromptText)}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="恢复为本次打开时的原始内容"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>恢复初始</span>
                </button>

                <button
                  type="button"
                  disabled={isReconstructingId === editingTask.id}
                  onClick={() => handleReconstructShotWithAI(editingTask)}
                  className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  title="让视觉大模型重新规划此分镜机位与描述"
                >
                  {isReconstructingId === editingTask.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>AI 重构机位</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSavePrompt}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>保存修改</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndGenerate}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-500/20 flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>保存并立即渲染</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setActiveLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl p-2" onClick={e => e.stopPropagation()}>
            <img
              src={activeLightboxImage}
              alt=""
              className="w-full h-full max-h-[82vh] object-contain rounded-2xl"
            />
            <div className="p-3 flex items-center justify-between bg-white text-slate-900 border-t border-slate-100">
              <span className="text-xs font-bold">
                {activeLightboxTitle}
              </span>
              <button
                onClick={() => setActiveLightboxImage(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 Toast 提醒气泡 */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-60 bg-slate-900/90 backdrop-blur-md text-white text-xs px-4 py-2.5 rounded-2xl shadow-xl border border-white/10 animate-fade-in flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
