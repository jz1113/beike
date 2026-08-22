'use client';
import { apiFetch } from '@/lib/apiClient';
import { confirmAction } from '@/lib/confirmAction';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAppStore, GenerationTask } from '@/store/useAppStore';
import {
  IMAGE_GEN_MODELS,
  assembleOriginalShotPrompt,
  formatDisplayModel,
  normalizeOriginalProductRole,
} from '@/lib/drawing';
import { compressImageToDataUrl } from '@/lib/image-utils';
import { getEnabledImageModelsFromSettings } from '@/lib/workflowModels';
import { getClientStorageHeaders } from '@/lib/storageClient';
import { recordModelUsage } from '@/lib/usageTracker';
import { normalizeVisionModelId } from '@/lib/vision';
import { Sparkles, X } from 'lucide-react';

import ImageGenParamPanel from './ImageGenParamPanel';
import ImageGenTaskGrid from './ImageGenTaskGrid';
import ImageGenPromptEditor from './ImageGenPromptEditor';
import type { WorkshopPrimaryAction } from './WorkshopTopBar';
import {
  originalGenPhaseLabel,
  resolveOriginalGenPhase,
} from './originalGenPhase';
import { resolveGptImageHubSize } from '@/features/hub/gptImageGatewaySizes';

interface Props {
  onBackToStep2: () => void;
  onNextToStep4: () => void;
  hideChromeNav?: boolean;
  onBindPrimaryAction?: (action: WorkshopPrimaryAction | null) => void;
}

export default function ImageGenStudio({
  onBackToStep2,
  onNextToStep4,
  hideChromeNav,
  onBindPrimaryAction,
}: Props) {
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
    originalAnchorFaceImageUrl,
    setAnchorFaceImageUrl,
    isAnchorFaceConfirmed,
    originalIsAnchorFaceConfirmed,
    setIsAnchorFaceConfirmed,
    isSocialPromptSourceStale,
    sceneAnchorEnabled,
    setSceneAnchorEnabled,
    productRole,
  } = useAppStore();

  const socialPromptStale = workshopMode === 'social_face_product_swap' && isSocialPromptSourceStale();
  const isSocialMode = workshopMode === 'social_face_product_swap';
  const effectiveAnchorFaceImageUrl = isSocialMode ? anchorFaceImageUrl : originalAnchorFaceImageUrl;
  const effectiveIsAnchorFaceConfirmed = isSocialMode ? isAnchorFaceConfirmed : originalIsAnchorFaceConfirmed;

  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null);
  const [activeLightboxTitle, setActiveLightboxTitle] = useState<string>('');
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [availableImageModels, setAvailableImageModels] = useState<any[]>([]);
  
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
      const rawVisionModel = typeof window !== 'undefined'
        ? (localStorage.getItem('ai_multimodal_model') || localStorage.getItem('ai_vision_model') || 'gpt-5.6-luna')
        : 'gpt-5.6-luna';
      const targetVisionModel = normalizeVisionModelId(rawVisionModel);
      const targetProductImage = selectedProductImage?.url || product?.picUrl || (images.length > 0 ? images[0]?.url : undefined);

      const res = await apiFetch('/api/generate/analyze', {
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
  const pollCancelledRef = useRef(false);
  useEffect(() => {
    pollCancelledRef.current = false;
    return () => {
      pollCancelledRef.current = true;
    };
  }, []);

  // 加载设置页已启用的生图模型（与 Hub 同源）
  useEffect(() => {
    const loadCustomImageModels = () => {
      const customImg = getEnabledImageModelsFromSettings();
      setAvailableImageModels(customImg);
    };

    loadCustomImageModels();
    window.addEventListener('models_updated', loadCustomImageModels);
    return () => window.removeEventListener('models_updated', loadCustomImageModels);
  }, []);

  // 选中的用于生图的底图
  const selectedProductImage = images.find(img => img.selected) || images[0];

  // 初始化生图任务列表（仅在空槽或分镜增多时扩展，避免冲掉已成功图）
  useEffect(() => {
    const selectedPrompts = generatedPrompts.filter(p => p.selected !== false);
    const effectiveCount = selectedPrompts.length > 0 ? selectedPrompts.length : generatedPrompts.length;
    if (effectiveCount === 0) return;
    const hasSuccess = generationTasks.some(t => t.status === 'SUCCESS' && t.resultUrl);
    if (generationTasks.length === 0) {
      initGenerationTasks();
    } else if (effectiveCount > generationTasks.length) {
      initGenerationTasks();
    } else if (generationTasks.length !== effectiveCount && !hasSuccess) {
      initGenerationTasks();
    }
  }, [generatedPrompts, generationTasks.length, initGenerationTasks, generationTasks]);

  // 轮询单个任务状态
  const pollTaskStatus = async (taskId: string, internalId: string) => {
    if (pollingRef.current[taskId]) return;
    pollingRef.current[taskId] = true;

    let attempts = 0;
    const maxAttempts = 60; // 最多轮询 120 秒

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2500));
      if (pollCancelledRef.current) return;
      attempts++;

      try {
        const localUrl = typeof window !== 'undefined' ? localStorage.getItem('ai_base_url') || '' : '';
        const localKey = typeof window !== 'undefined' ? localStorage.getItem('ai_api_key') || '' : '';
        const queryParams = new URLSearchParams({ taskId });
        if (pollCancelledRef.current) break;

        const res = await apiFetch(`/api/generate/image?${queryParams.toString()}`, {
          headers: {
            ...getClientStorageHeaders(),
            ...(localKey ? { 'x-custom-api-key': localKey } : {}),
            ...(localUrl ? { 'x-custom-base-url': localUrl } : {}),
          },
        }).catch(() => null);
        if (pollCancelledRef.current) break;
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
            // 禁止用生活照结果自动定脸：会把 Shot1 表情锁进整组；仅用户上传正脸或手动「确认此人脸」
            pollingRef.current[taskId] = false;
            break;
          }
        }
      } catch (err) {
        console.warn('轮询状态异常:', err);
      }
    }
    // 超时仍未完成：明确标为 FAILURE，避免永久「渲染中」
    if (pollCancelledRef.current) {
      pollingRef.current[taskId] = false;
      return;
    }
    const latest = useAppStore.getState().generationTasks.find(t => t.id === internalId);
    if (latest && latest.status === 'IN_PROGRESS') {
      updateGenerationTask(internalId, {
        status: 'FAILURE',
        failReason: '渲染超时，请点击重试',
        progress: '0%'
      });
    }
    pollingRef.current[taskId] = false;
  };

  // 启动单个分镜生图
  const handleGenerateSingle = async (task: GenerationTask) => {
    if (availableImageModels.length === 0) {
      showToast('请先在设置中从网关拉取生图模型');
      return;
    }

    if (useAppStore.getState().workshopMode === 'social_face_product_swap' && useAppStore.getState().isSocialPromptSourceStale()) {
      showToast('参考图已变更，请先回到 Step2 重新视觉分析');
      return;
    }

    updateGenerationTask(task.id, {
      status: 'IN_PROGRESS',
      progress: '提交渲染中...',
      resultUrl: undefined,
      failReason: undefined
    });

    const localUrl = typeof window !== 'undefined' ? localStorage.getItem('ai_base_url') || undefined : undefined;
    const localKey = typeof window !== 'undefined' ? localStorage.getItem('ai_api_key') || undefined : undefined;

    const isFirstShot = generationTasks[0]?.id === task.id;
    const hasHuman = task.has_human === true || (task.has_human !== false && task.shot_type === 'model_shot');
    // 人物镜必须传专属正脸；纯商品镜绝不附带正脸板
    const passAnchorFace = hasHuman ? useAppStore.getState().getEffectiveAnchorFaceImageUrl() : undefined;

    const isSocialModeNow = useAppStore.getState().workshopMode === 'social_face_product_swap';

    if (isSocialModeNow && hasHuman && !passAnchorFace) {
      showToast('人物镜缺少专属正脸（@图片3），请先上传并锁定正脸后再生成');
      updateGenerationTask(task.id, {
        status: 'FAILURE',
        progress: undefined,
        failReason: '缺少专属正脸垫图',
      });
      return;
    }

    // 场景定桩：仅原创 + 开关开启 + 非首镜 + 首镜已成功
    const currentAllTasks = useAppStore.getState().generationTasks;
    const firstShotTask = currentAllTasks[0];
    const sceneAnchorOn = useAppStore.getState().sceneAnchorEnabled !== false;
    const passSceneAnchor = (!isSocialModeNow && sceneAnchorOn && !isFirstShot && firstShotTask?.status === 'SUCCESS' && firstShotTask?.resultUrl)
      ? firstShotTask.resultUrl
      : undefined;

    // 核心：本分镜绑定的实物图最高优先
    const isBackViewShot = /背壳|背面|后背|背部|后侧|背面装甲|转轴|接口/i.test((task.prompt || '') + ' ' + (task.title || '') + ' ' + (task.scene || ''));
    
    let targetProductImage = task.productImageUrl || selectedProductImage?.url || product?.picUrl || (images.length > 0 ? images[0]?.url : undefined);
    
    if (!task.productImageUrl && isBackViewShot && images.length > 1) {
      const backCandidate = images.find((img, idx) => idx > 0 && img.url) || images[images.length - 1];
      if (backCandidate?.url) {
        targetProductImage = backCandidate.url;
      }
    }

    const appearanceLockOn = useAppStore.getState().useReferenceImage !== false;
    
    // 爆款：@图片1 商品 → @图片2 社媒构图 → @图片3 正脸
    // 原创：@图片1 商品 → @图片2 正脸(可选) → 末槽 场景定桩(可选；无正脸时为 @图片2)
    const socialRefImage = task.referenceImageUrl;

    if (isSocialModeNow) {
      if (!targetProductImage) {
        showToast('缺少商品垫图（@图片1），请先在素材步选好商品图');
        updateGenerationTask(task.id, {
          status: 'FAILURE',
          progress: undefined,
          failReason: '缺少商品垫图',
        });
        return;
      }
      if (!socialRefImage) {
        showToast('缺少构图参考图（@图片2），请回到 Step2 重新分析');
        updateGenerationTask(task.id, {
          status: 'FAILURE',
          progress: undefined,
          failReason: '缺少构图参考图',
        });
        return;
      }
    } else {
      // 原创：外观锁开启时必须有商品图
      if (appearanceLockOn && !targetProductImage) {
        showToast('缺少商品垫图（@图片1），请先在素材步选好商品图');
        updateGenerationTask(task.id, {
          status: 'FAILURE',
          progress: undefined,
          failReason: '缺少商品垫图',
        });
        return;
      }
      if (!appearanceLockOn) {
        const ok = typeof window !== 'undefined'
          ? await confirmAction('已关闭「强制跟商品图」，本次将不垫商品外观参考，成图可能偏离实物。确认继续？')
          : true;
        if (!ok) {
          updateGenerationTask(task.id, {
            status: 'IDLE',
            progress: undefined,
            failReason: undefined,
          });
          return;
        }
        targetProductImage = undefined;
      }
    }

    const ensureLeanUrl = async (url?: string | null): Promise<string | undefined> => {
      if (!url || typeof url !== 'string') return undefined;
      let next = url;
      // blob: 仅存在于当前浏览器页，服务端无法拉取；提交前转成 JPEG data URL
      if (next.startsWith('blob:')) {
        try {
          const converted = await compressImageToDataUrl(next, 1280, 0.78);
          if (converted && converted.startsWith('data:image/')) next = converted;
          else return undefined;
        } catch {
          return undefined;
        }
      }
      if (next.startsWith('blob:')) return undefined;
      // data URL：超过约 100KB 字符即压成 JPEG，避免多图叠加撑破 ~10MB 网关体上限
      if (next.startsWith('data:image/') && next.length > 100_000) {
        try {
          const lean = await compressImageToDataUrl(next, 1280, 0.78);
          if (lean && lean.startsWith('data:image/') && lean.length < next.length) return lean;
        } catch {
          /* keep original */
        }
      }
      return next;
    };

    try {
      let [leanProductImg, leanSocialRefImg, leanAnchorFace, leanSceneAnchor] = await Promise.all([
        ensureLeanUrl(targetProductImage),
        ensureLeanUrl(socialRefImage),
        ensureLeanUrl(passAnchorFace),
        ensureLeanUrl(passSceneAnchor)
      ]);

      // 仍过大则二次强压（更小边长）
      const recompressHard = async (u?: string) => {
        if (!u?.startsWith('data:image/') || u.length <= 350_000) return u;
        try {
          const lean = await compressImageToDataUrl(u, 896, 0.7);
          return lean?.startsWith('data:image/') && lean.length < u.length ? lean : u;
        } catch {
          return u;
        }
      };
      [leanProductImg, leanSocialRefImg, leanAnchorFace, leanSceneAnchor] = await Promise.all([
        recompressHard(leanProductImg),
        recompressHard(leanSocialRefImg),
        recompressHard(leanAnchorFace),
        recompressHard(leanSceneAnchor),
      ]);

      const orderedImages = isSocialModeNow
        ? ([leanProductImg, leanSocialRefImg, leanAnchorFace].filter(Boolean) as string[])
        : ([
            leanProductImg,
            ...(leanAnchorFace ? [leanAnchorFace] : []),
            ...(leanSceneAnchor ? [leanSceneAnchor] : []),
          ].filter(Boolean) as string[]);

      // 原创：生图前用组级圣经重拼 Prompt（含 productRole / fingerprint / 定桩）
      // 爆款：注入身份/表情解耦守卫，并强制写入 expression 关键词
      let finalPrompt = task.prompt || '';
      let socialExpression: string | undefined;
      if (!isSocialModeNow) {
        const store = useAppStore.getState();
        const role = normalizeOriginalProductRole(store.productRole, store.productFingerprint);
        const matchedPrompt = store.generatedPrompts.find(
          (p) => p.shot_no === task.shotNo || p.title === task.title
        );
        finalPrompt = assembleOriginalShotPrompt(
          {
            identityBible: store.identityBible,
            lookBible: store.lookBible,
            lookParts: store.lookParts || undefined,
            masterScene: store.masterScene,
            styleBible: store.styleBible,
            productRole: role,
            productFingerprint: store.productFingerprint || undefined,
          },
          {
            shot_no: task.shotNo,
            expression: matchedPrompt?.expression || task.expression,
            action: matchedPrompt?.action || task.action,
            prop: matchedPrompt?.prop,
            optics: matchedPrompt?.optics,
            camera_focal_length: matchedPrompt?.camera_focal_length,
            angle: matchedPrompt?.angle,
            lighting_type: matchedPrompt?.lighting_type,
            scene: matchedPrompt?.scene || task.scene,
            title: task.title,
            has_human: hasHuman,
            promptFallback: task.prompt,
          },
          {
            hasFace: Boolean(leanAnchorFace) && hasHuman,
            hasSceneAnchor: Boolean(leanSceneAnchor),
          }
        );
        // 用户在编辑器改过的正文：若与任务当前 prompt 一致于 fallback，仍以重拼为准；
        // 若用户刚保存了 editingPromptText，task.prompt 已更新——仅当与库内旧 prompt 不同时保留用户稿并再注入守卫
        if (task.prompt && matchedPrompt?.prompt && task.prompt !== matchedPrompt.prompt) {
          const { ensureOriginalPromptSlots } = await import('@/lib/drawing');
          finalPrompt = ensureOriginalPromptSlots(task.prompt, {
            hasHuman,
            hasFace: Boolean(leanAnchorFace) && hasHuman,
            hasSceneAnchor: Boolean(leanSceneAnchor),
            masterScene: store.masterScene,
            identityBible: store.identityBible,
            lookBible: store.lookBible,
            productRole: role,
            productFingerprint: store.productFingerprint || undefined,
          });
        }
      } else if (hasHuman) {
        const { ensureSocialPromptSlots } = await import('@/lib/drawing');
        const store = useAppStore.getState();
        const matchedPrompt = store.generatedPrompts.find(
          (p) => p.shot_no === task.shotNo || p.title === task.title
        );
        socialExpression = matchedPrompt?.expression || task.expression || undefined;
        finalPrompt = ensureSocialPromptSlots(task.prompt || '', {
          hasHuman: true,
          hasFace: Boolean(leanAnchorFace),
          socialMode: true,
          expression: socialExpression,
        });
      }

      // 槽位字段已齐全时不再重复塞 images[]，避免同一张图 base64 传 2～3 遍撑爆请求体
      const hasSlotFields = Boolean(leanProductImg) || Boolean(leanSocialRefImg) || Boolean(leanAnchorFace);
      const requestBody: Record<string, unknown> = {
          prompt: finalPrompt,
          model: selectedImageGenModel,
          size: resolveGptImageHubSize(
            selectedAspectId,
            selectedImageGenModel,
            (selectedQuality || 'high') as 'high' | 'medium' | 'low'
          ),
          aspectRatio: selectedAspectId,
          quality: selectedQuality || 'high',
          productImageUrl: leanProductImg,
          // 仅爆款复刻传社媒构图槽；原创勿传，否则服务端会误判 socialMode
          socialReferenceImageUrl: isSocialModeNow ? leanSocialRefImg : undefined,
          referenceImageUrl: leanProductImg || (isSocialModeNow ? leanSocialRefImg : undefined),
          sceneAnchorImageUrl: leanSceneAnchor,
          anchorFaceImageUrl: leanAnchorFace,
          useReferenceImage: appearanceLockOn && Boolean(leanProductImg),
          has_human: task.has_human,
          shot_type: task.shot_type,
          expression: socialExpression,
          workshopMode: useAppStore.getState().workshopMode,
          productRole: !isSocialModeNow
            ? normalizeOriginalProductRole(
                useAppStore.getState().productRole,
                useAppStore.getState().productFingerprint
              )
            : undefined,
          productFingerprint: !isSocialModeNow
            ? useAppStore.getState().productFingerprint || undefined
            : undefined,
          productTitle: product?.title || '电商商品',
          customBaseUrl: localUrl,
          customApiKey: localKey
      };
      if (!hasSlotFields && orderedImages.length > 0) {
        requestBody.images = orderedImages;
      }

      const bodyStr = JSON.stringify(requestBody);
      // 常见反向代理 / Node 体上限约 10MB；预留余量并给出可操作提示
      if (bodyStr.length > 8_500_000) {
        throw new Error(
          '参考图像素或体积过大，请求体超过上限。请换较小的商品/构图图，或先压缩后再生成。'
        );
      }

      const res = await apiFetch('/api/generate/image', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getClientStorageHeaders()
        },
        body: bodyStr,
      }).catch(() => null);

      if (!res) {
        throw new Error('网络连接异常，请检查网络设置');
      }

      const data = await res.json().catch((parseErr: any) => {
        // 响应体过大或格式异常导致 JSON 解析失败时，返回友好错误而非底层异常信息
        console.warn('生图响应 JSON 解析失败:', parseErr?.message);
        return null;
      });

      if (!res.ok || !data?.success) {
        const errMsg = data?.error || `生成请求失败 (HTTP ${res.status})`;
        // 将底层 JSON 解析异常转化为用户友好提示
        const friendlyMsg = errMsg.includes('Unterminated string') || errMsg.includes('截断') || errMsg.includes('体积过大') || (errMsg.includes('JSON') && errMsg.includes('过大'))
          ? (errMsg.includes('压缩') || errMsg.includes('截断') || errMsg.includes('参考图')
              ? errMsg
              : '参考图体积过大导致请求失败，请压缩垫图或换较小图片后重试')
          : errMsg;
        throw new Error(friendlyMsg);
      }

      const resolvedModelId = data.model || selectedImageGenModel;
      recordModelUsage({
        modelId: resolvedModelId,
        modelName: formatDisplayModel(resolvedModelId),
        provider: resolvedModelId.includes('seedream') ? '字节即梦' : resolvedModelId.includes('grok') ? 'xAI' : resolvedModelId.includes('gemini') ? 'Google' : 'OpenAI',
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
          taskId: data.taskId,
          ...(data.model ? { model: data.model } : {}),
        });
        // 不自动 setAnchorFaceImageUrl(resultUrl)，避免生活照表情污染后续分镜
      } else if (data.taskId) {
        // 异步任务进入轮询
        updateGenerationTask(task.id, {
          status: 'IN_PROGRESS',
          progress: '正在排队渲染中...',
          ...(data.model ? { model: data.model } : {}),
        });
        pollTaskStatus(data.taskId, task.id);
      }
    } catch (err: any) {
      console.warn('生图请求未成功:', err?.message || err);
      updateGenerationTask(task.id, {
        status: 'FAILURE',
        failReason: err?.message || '生成请求未成功完成'
      });
    }
  };

  // 一键批量 / 阶段主 CTA
  const handleBatchGenerate = async (opts?: { onlyShot1?: boolean; onlyRest?: boolean }) => {
    if (availableImageModels.length === 0) {
      showToast('请先在设置中从网关拉取生图模型');
      return;
    }

    if (useAppStore.getState().workshopMode === 'social_face_product_swap' && useAppStore.getState().isSocialPromptSourceStale()) {
      showToast('参考图已变更，请先回到 Step2 重新视觉分析');
      return;
    }

    let currentTasks = useAppStore.getState().generationTasks;
    
    // 如果所有分镜均已出图，点击全部重新生成时，自动重置全部任务状态并全量重新跑
    const allFinished = currentTasks.length > 0 && currentTasks.every(t => t.status === 'SUCCESS');
    if (allFinished && !opts?.onlyShot1 && !opts?.onlyRest) {
      initGenerationTasks(true);
      currentTasks = useAppStore.getState().generationTasks;
    }

    setIsBatchGenerating(true);
    const isSocialBatch = useAppStore.getState().workshopMode === 'social_face_product_swap';
    const sceneAnchorOn = useAppStore.getState().sceneAnchorEnabled !== false;
    const isNoModel = !modelPersona || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物');
    const hasAnyHuman = !isNoModel && currentTasks.some(t => t.has_human === true || (t.has_human !== false && (t.shot_type === 'model_shot' || !t.shot_type)));

    try {
      if (!isSocialBatch && opts?.onlyShot1) {
        const firstTask = currentTasks[0];
        if (firstTask?.prompt) await handleGenerateSingle(firstTask);
        return;
      }

      if (!isSocialBatch && opts?.onlyRest) {
        const restTasks = currentTasks.slice(1).filter(t => t.prompt && t.status !== 'SUCCESS');
        await Promise.all(restTasks.map(task => handleGenerateSingle(task)));
        return;
      }

      // 原创：场景定桩开启时强制先跑分镜 1
      if (!isSocialBatch && sceneAnchorOn && currentTasks.length > 1) {
        const firstTask = currentTasks[0];
        if (firstTask?.prompt && firstTask.status !== 'SUCCESS') {
          await handleGenerateSingle(firstTask);
          const refreshed = useAppStore.getState().generationTasks[0];
          if (refreshed?.status !== 'SUCCESS') {
            showToast('分镜 1 未成功，已暂停后续分镜（场景定桩需要首图）');
            return;
          }
        }
        // 人物模式：无正脸时停在确认人脸
        if (hasAnyHuman && !useAppStore.getState().getEffectiveIsAnchorFaceConfirmed() && !useAppStore.getState().getEffectiveAnchorFaceImageUrl()) {
          showToast('请确认分镜 1 人脸后，再生成其余分镜');
          return;
        }
        const restTasks = useAppStore.getState().generationTasks.slice(1).filter(t => t.prompt && t.status !== 'SUCCESS');
        await Promise.all(restTasks.map(task => handleGenerateSingle(task)));
        return;
      }

      if (!isSocialBatch && hasAnyHuman) {
        if (!effectiveIsAnchorFaceConfirmed && !effectiveAnchorFaceImageUrl) {
          if (currentTasks[0]?.prompt) {
            await handleGenerateSingle(currentTasks[0]);
          }
          showToast('请确认分镜 1 人脸后，再生成其余分镜');
          return;
        }
        const uncompletedTasks = currentTasks.filter(t => t.prompt && t.status !== 'SUCCESS');
        await Promise.all(uncompletedTasks.map(task => handleGenerateSingle(task)));
        return;
      }

      const uncompleted = currentTasks.filter(t => t.prompt && t.status !== 'SUCCESS');
      await Promise.all(uncompleted.map(task => handleGenerateSingle(task)));
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const originalPhase = useMemo(() => {
    if (isSocialMode) return null;
    return resolveOriginalGenPhase({
      tasks: generationTasks,
      isBatchGenerating,
      sceneAnchorEnabled: sceneAnchorEnabled !== false,
      modelPersona,
      anchorFaceImageUrl: effectiveAnchorFaceImageUrl,
      isAnchorFaceConfirmed: effectiveIsAnchorFaceConfirmed,
    });
  }, [
    isSocialMode,
    generationTasks,
    isBatchGenerating,
    sceneAnchorEnabled,
    modelPersona,
    effectiveAnchorFaceImageUrl,
    effectiveIsAnchorFaceConfirmed,
  ]);

  const restPendingCount = generationTasks.slice(1).filter(t => t.prompt && t.status !== 'SUCCESS').length;
  const successCount = generationTasks.filter(t => t.status === 'SUCCESS').length;
  const inProgressCount = generationTasks.filter(t => t.status === 'IN_PROGRESS').length;
  const totalCount = generationTasks.length;

  const runPrimaryGenAction = useCallback(async () => {
    if (isSocialMode) {
      await handleBatchGenerate();
      return;
    }
    const phase = resolveOriginalGenPhase({
      tasks: useAppStore.getState().generationTasks,
      isBatchGenerating: useAppStore.getState().isBatchGenerating,
      sceneAnchorEnabled: useAppStore.getState().sceneAnchorEnabled !== false,
      modelPersona: useAppStore.getState().modelPersona,
      anchorFaceImageUrl: useAppStore.getState().getEffectiveAnchorFaceImageUrl(),
      isAnchorFaceConfirmed: useAppStore.getState().getEffectiveIsAnchorFaceConfirmed(),
    });
    if (phase === 'need_shot1') {
      await handleBatchGenerate({ onlyShot1: true });
      return;
    }
    if (phase === 'need_face_confirm') {
      showToast('请先在画布上点击「确认此人脸」');
      return;
    }
    if (phase === 'ready_export') {
      onNextToStep4();
      return;
    }
    if (phase === 'ready_batch') {
      const first = useAppStore.getState().generationTasks[0];
      if (first?.status === 'SUCCESS') {
        await handleBatchGenerate({ onlyRest: true });
      } else {
        await handleBatchGenerate();
      }
      return;
    }
  }, [isSocialMode, onNextToStep4, handleBatchGenerate]);

  const runPrimaryGenActionRef = useRef(runPrimaryGenAction);
  runPrimaryGenActionRef.current = runPrimaryGenAction;
  const onNextToStep4Ref = useRef(onNextToStep4);
  onNextToStep4Ref.current = onNextToStep4;

  // 顶栏主 CTA：原创按阶段绑定（更新与卸载清理拆开，避免 cleanup(null) 把父状态打回空再绑一次）
  useEffect(() => {
    if (!onBindPrimaryAction) return;
    if (isSocialMode) {
      onBindPrimaryAction({
        label: successCount > 0 ? `下一步：导出 (${successCount})` : `批量生图 (${totalCount})`,
        disabled: socialPromptStale || totalCount === 0 || isBatchGenerating,
        loading: isBatchGenerating,
        onClick: () => {
          const tasks = useAppStore.getState().generationTasks;
          const ok = tasks.filter((t) => t.status === 'SUCCESS').length;
          if (ok > 0 && tasks.every((t) => t.status === 'SUCCESS' || t.status === 'FAILURE')) {
            onNextToStep4Ref.current();
          } else {
            void runPrimaryGenActionRef.current();
          }
        },
      });
      return;
    }

    const phase = originalPhase || 'ready_batch';
    onBindPrimaryAction({
      label: originalGenPhaseLabel(phase, {
        restCount: restPendingCount || totalCount,
        successCount,
      }),
      disabled:
        phase === 'generating' ||
        phase === 'need_face_confirm' ||
        totalCount === 0,
      loading: phase === 'generating',
      onClick: () => {
        void runPrimaryGenActionRef.current();
      },
    });
  }, [
    onBindPrimaryAction,
    isSocialMode,
    originalPhase,
    successCount,
    totalCount,
    restPendingCount,
    isBatchGenerating,
    socialPromptStale,
  ]);

  useEffect(() => {
    if (!onBindPrimaryAction) return;
    return () => onBindPrimaryAction(null);
  }, [onBindPrimaryAction]);

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

  return (
    <div className="flex-1 flex overflow-hidden bg-[#F8F9FA] text-slate-900 select-none">
      <ImageGenParamPanel
        hideChromeNav={hideChromeNav}
        onBackToStep2={onBackToStep2}
        workshopMode={workshopMode}
        useReferenceImage={useReferenceImage}
        setUseReferenceImage={setUseReferenceImage}
        selectedProductImage={selectedProductImage}
        productTitle={product?.title}
        sceneAnchorEnabled={sceneAnchorEnabled}
        setSceneAnchorEnabled={setSceneAnchorEnabled}
        firstTask={generationTasks[0]}
        availableImageModels={availableImageModels}
        selectedImageGenModel={selectedImageGenModel}
        setSelectedImageGenModel={setSelectedImageGenModel}
        selectedAspectId={selectedAspectId}
        setSelectedAspectId={setSelectedAspectId}
        selectedQuality={selectedQuality}
        setSelectedQuality={setSelectedQuality}
        productRole={productRole}
      />

      <ImageGenTaskGrid
        socialPromptStale={socialPromptStale}
        onBackToStep2={onBackToStep2}
        totalCount={totalCount}
        successCount={successCount}
        inProgressCount={inProgressCount}
        initGenerationTasks={initGenerationTasks}
        handleBatchGenerate={() => void handleBatchGenerate()}
        isBatchGenerating={isBatchGenerating}
        generationTasks={generationTasks}
        hideChromeNav={hideChromeNav}
        onNextToStep4={onNextToStep4}
        modelPersona={modelPersona}
        isAnchorFaceConfirmed={effectiveIsAnchorFaceConfirmed}
        setAnchorFaceImageUrl={setAnchorFaceImageUrl}
        setIsAnchorFaceConfirmed={setIsAnchorFaceConfirmed}
        handleGenerateSingle={handleGenerateSingle}
        anchorFaceImageUrl={effectiveAnchorFaceImageUrl}
        setActiveLightboxImage={setActiveLightboxImage}
        setActiveLightboxTitle={setActiveLightboxTitle}
        selectedAspectId={selectedAspectId}
        workshopMode={workshopMode}
        isReconstructingId={isReconstructingId}
        handleOpenPromptEditor={handleOpenPromptEditor}
        handleReconstructShotWithAI={handleReconstructShotWithAI}
        handleDownload={handleDownload}
        originalPhase={originalPhase}
        hidePrimaryBatchCta={Boolean(hideChromeNav && !isSocialMode)}
        imageModelsReady={availableImageModels.length > 0}
      />

      {editingTask && (
        <ImageGenPromptEditor
          editingTask={editingTask}
          editingPromptText={editingPromptText}
          setEditingPromptText={setEditingPromptText}
          originalPromptText={originalPromptText}
          workshopMode={workshopMode}
          isReconstructingId={isReconstructingId}
          onClose={() => setEditingTask(null)}
          onAppendKeyword={handleAppendKeyword}
          onSavePrompt={handleSavePrompt}
          onSaveAndGenerate={handleSaveAndGenerate}
          onReconstructShot={handleReconstructShotWithAI}
          showToast={showToast}
        />
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

      {toastMsg && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold shadow-xl flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          {toastMsg}
        </div>
      )}
    </div>
  );
}
