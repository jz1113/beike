import { useState, useEffect, useMemo, useCallback } from 'react';
import { getGatewayClientOverrides } from '@/lib/gatewayClient';
import { apiFetch } from '@/lib/apiClient';
import { recordModelUsage, resolveModelVendor } from '@/lib/usageTracker';
import { compressImageToDataUrl } from '@/lib/image-utils';
import { formatUserError } from '@beike/shared/upstreamErrors';
import { DEFAULT_CATEGORIES, getMergedCategories, CategoryItem } from '@beike/shared/vision';
import { pickOrderedMultimodalFallbacks } from '@beike/shared/workflowModels';
import '@beike/shared/drawing';
import { getExternalScraperCredentials } from '@/lib/externalScraperCredentials';
import { useFileDropZone } from '@/lib/useFileDropZone';
import { useSafeTimeout } from '@/lib/useSafeTimeout';
import type { ExtractedRecipeData } from './types';

export interface UseStyleExtractWorkflowOptions {
  isOpen: boolean;
  onClose: () => void;
  onRecipeCreated?: (recipe: any) => void;
}

export function useStyleExtractWorkflow({
  isOpen,
  onClose,
  onRecipeCreated,
}: UseStyleExtractWorkflowOptions) {
  const { setSafeTimeout, clearSafeTimeout } = useSafeTimeout();

  // 图源选择 Tab
  const [sourceType, setSourceType] = useState<'link' | 'upload' | 'url'>('link');

  // 社媒链接输入与解析
  const [linkInput, setLinkInput] = useState('');
  const [isParsingLink, setIsParsingLink] = useState(false);
  const [parsedPostTitle, setParsedPostTitle] = useState('');
  const [parsedImages, setParsedImages] = useState<string[]>([]);

  // URL 直传输入
  const [urlInput, setUrlInput] = useState('');

  // 选中的最终参考图列表
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(24);

  // AI 逆向状态
  const [extractModel, setExtractModel] = useState<string>('gemini-3.1-pro-preview-thinking-high');
  const [multimodalModels, setMultimodalModels] = useState<Array<{ id: string; name: string }>>([
    { id: 'gemini-3.1-pro-preview-thinking-high', name: 'Gemini 3.1 Pro (深度思考 - 首选)' },
    { id: 'gpt-4o', name: 'GPT-4o (旗舰多模态)' },
    { id: 'grok-4.6', name: 'Grok 4.6 (反AI纪实)' },
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet (极速推理)' },
    { id: 'claude-opus-5', name: 'Claude Opus 5 (顶级推理)' },
    { id: 'gpt-5.5-pro', name: 'GPT 5.5 Pro (综合旗舰)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (轻量极速)' },
  ]);
  const [userHint, setUserHint] = useState('');
  const [extractStepText, setExtractStepText] = useState('⚡ 正在提取并对齐图集特征...');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedRecipe, setExtractedRecipe] = useState<ExtractedRecipeData | null>(null);

  // 归属品类列表与新建品类状态
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setSafeTimeout(() => setToastMsg(null), 2500);
  }, [setSafeTimeout]);

  // 高性能轻量化本地图片压缩工具 (限制最大边长 1024px)
  const compressImageFile = useCallback((file: File): Promise<string> => {
    return compressImageToDataUrl(file, 1024, 0.85).catch(() => '');
  }, []);

  // 模型配置加载
  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      const saved = localStorage.getItem('custom_models');
      let list: Array<{ id: string; name: string }> = [];
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            list = parsed
              .filter((m: any) => m.isMultimodal || m.isVision || (!m.isImage && !m.isVideo))
              .map((m: any) => ({ id: m.id, name: m.name || m.id }));
            if (list.length > 0) {
              setMultimodalModels(list);
            }
          }
        } catch {}
      }
      const defaultM = localStorage.getItem('ai_multimodal_model') || localStorage.getItem('ai_vision_model');
      if (defaultM) {
        setExtractModel(defaultM);
      } else if (list.length > 0) {
        setExtractModel(list[0].id);
      }
    }
  }, [isOpen]);

  // 剪贴板 Ctrl+V / Command+V 图片直接粘贴支持
  useEffect(() => {
    if (!isOpen) return;
    setCategories(getMergedCategories());

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            compressImageFile(file).then((url) => {
              if (url) {
                setSelectedImages((prev) => Array.from(new Set([...prev, url])));
                showToast('🎉 已成功从剪贴板粘贴图片素材！');
              }
            });
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, compressImageFile, showToast]);

  const handleCreateNewCategory = useCallback(() => {
    if (!newCategoryName.trim()) {
      alert('请输入新商品类目名称');
      return;
    }
    const name = newCategoryName.trim();
    const id = `cat_${Date.now()}`;
    const newCat: CategoryItem = {
      id,
      name:
        name.startsWith('🏷️') ||
        name.startsWith('📦') ||
        name.startsWith('⛺') ||
        name.startsWith('🚗') ||
        name.startsWith('🎮')
          ? name
          : `🏷️ ${name}`,
      isCustom: true,
    };
    const updated = [...categories, newCat];
    setCategories(updated);
    localStorage.setItem('custom_categories', JSON.stringify(updated));
    if (extractedRecipe) {
      setExtractedRecipe((prev) => (prev ? { ...prev, category: id } : null));
    }
    setIsCreatingCategory(false);
    setNewCategoryName('');
    showToast(`✨ 成功创建新类目【${newCat.name}】！`);
  }, [categories, extractedRecipe, newCategoryName, showToast]);

  // 智能均匀采样最具代表性的核心参考图
  const handleAutoSelectKeyShots = useCallback((imagesToPick = parsedImages) => {
    if (!imagesToPick || imagesToPick.length === 0) return;
    const targetCount = Math.min(8, Math.max(4, Math.ceil(imagesToPick.length / 4)));
    const step = Math.max(1, Math.floor(imagesToPick.length / targetCount));
    const picked: string[] = [];
    for (let i = 0; i < imagesToPick.length && picked.length < targetCount; i += step) {
      picked.push(imagesToPick[i]);
    }
    setSelectedImages(picked);
    showToast(`✨ 已智能精选 ${picked.length} 张核心代表图（AI 提炼黄金数量）！`);
  }, [parsedImages, showToast]);

  // 切换单张图片勾选
  const handleToggleImage = useCallback((img: string) => {
    setSelectedImages((prev) => {
      if (prev.includes(img)) {
        return prev.filter((i) => i !== img);
      } else {
        return [...prev, img];
      }
    });
  }, []);

  // 社媒链接解析
  const handleParseLink = useCallback(async () => {
    const lines = linkInput
      .split(/[\n\r]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      showToast('请粘贴小红书/抖音分享链接或文本');
      return;
    }

    setIsParsingLink(true);
    try {
      const { scraperId, scraperSecret } = await getExternalScraperCredentials();

      const parseOneLine = (line: string) =>
        apiFetch('/api/catalog/styles/parse-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: line,
            text: line,
            scraperId,
            customScraperId: scraperId,
            scraperSecret,
            customApiKey: scraperSecret,
          }),
        }).then((res) => res.json());

      const concurrency = 3;
      const results: PromiseSettledResult<Record<string, unknown>>[] = new Array(lines.length);
      let nextIdx = 0;

      const worker = async () => {
        while (true) {
          const i = nextIdx++;
          if (i >= lines.length) break;
          try {
            const value = await parseOneLine(lines[i]);
            results[i] = { status: 'fulfilled', value };
          } catch (reason) {
            results[i] = { status: 'rejected', reason };
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, lines.length) }, () => worker()));
      const allExtractedImages: string[] = [];
      const successfulTitles: string[] = [];
      let failCount = 0;
      let lastErr = '';

      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value?.success) {
          const imgs =
            Array.isArray(res.value.images) && res.value.images.length > 0
              ? (res.value.images as string[])
              : (res.value.cover ? [res.value.cover as string] : []);
          if (imgs.length > 0) {
            allExtractedImages.push(...imgs);
          }
          if (res.value.title) {
            successfulTitles.push(String(res.value.title));
          }
        } else {
          failCount++;
          if (res.status === 'fulfilled' && res.value?.error) {
            lastErr = String(res.value.error);
          } else if (res.status === 'rejected' && res.reason?.message) {
            lastErr = String(res.reason.message);
          }
        }
      });

      const uniqueExtractedImages = Array.from(new Set(allExtractedImages));

      if (uniqueExtractedImages.length > 0) {
        setParsedImages(uniqueExtractedImages);
        if (successfulTitles.length > 0) {
          setParsedPostTitle(successfulTitles[0]);
        }
        handleAutoSelectKeyShots(uniqueExtractedImages);

        if (failCount > 0) {
          showToast(`⚡ 成功解析 ${lines.length - failCount}/${lines.length} 篇图文，共 ${uniqueExtractedImages.length} 张图片`);
        } else {
          showToast(`🎉 成功解析 ${uniqueExtractedImages.length} 张高清图片素材！`);
        }
      } else {
        showToast(lastErr || '未能提取到图片，请确认链接有效');
      }
    } catch (e: any) {
      alert(formatUserError(e, '解析失败，请检查网络或配置'));
    } finally {
      setIsParsingLink(false);
    }
  }, [handleAutoSelectKeyShots, linkInput, showToast]);

  // 本地图片批量上传与压缩入库
  const ingestStyleImages = useCallback(
    async (files: File[]) => {
      const validFiles = files.filter(
        (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif)$/i.test(f.name),
      );
      if (validFiles.length === 0) {
        showToast('请上传 JPG/PNG/WebP 等常见格式图片');
        return;
      }

      showToast(`正在批量压缩解析 ${validFiles.length} 张本地图片...`);
      const compressedResults = await Promise.all(validFiles.map((file) => compressImageFile(file)));
      const validUrls = compressedResults.filter(Boolean);
      if (validUrls.length > 0) {
        setSelectedImages((prev) => Array.from(new Set([...prev, ...validUrls])));
        showToast(`🎉 成功添加 ${validUrls.length} 张高清参考图！`);
      }
    },
    [compressImageFile, showToast],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      await ingestStyleImages(Array.from(files));
    },
    [ingestStyleImages],
  );

  const { dropZoneProps: styleUploadDropProps } = useFileDropZone({
    onFiles: (files) => {
      void ingestStyleImages(files);
    },
    accept: (file) => file.type.startsWith('image/') || /\.(jpe?g|png|webp|bmp|gif)$/i.test(file.name),
  });

  // 网络 URL 直传
  const handleAddUrls = useCallback(() => {
    if (!urlInput.trim()) return;
    const urls = urlInput
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http://') || u.startsWith('https://'));
    if (urls.length === 0) {
      showToast('请输入合法的 http/https 图片直链');
      return;
    }
    setSelectedImages((prev) => Array.from(new Set([...prev, ...urls])));
    setUrlInput('');
    showToast(`🎉 成功添加 ${urls.length} 个图片直链！`);
  }, [showToast, urlInput]);

  // 启动 AI 视觉逆向解构
  const handleStartExtract = useCallback(async () => {
    if (selectedImages.length === 0) {
      showToast('请至少提供 1 张参考图');
      return;
    }

    setIsExtracting(true);
    setExtractStepText('⚡ 正在提取并对齐图集特征...');
    const t1 = setSafeTimeout(() => setExtractStepText('🎨 正在解构空间置景与光影色调...'), 1200);
    const t2 = setSafeTimeout(() => setExtractStepText('✨ 正在封装品类专属生图配方...'), 2800);

    const imagesToSend = selectedImages;
    const { customBaseUrl: localUrl } = getGatewayClientOverrides();

    try {
      const res = await apiFetch('/api/catalog/styles/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls: imagesToSend,
          userHint: userHint.trim(),
          model: extractModel,
          fallbackModels: pickOrderedMultimodalFallbacks(
            extractModel,
            multimodalModels.map((m) => m.id).filter(Boolean),
          ),
          customBaseUrl: localUrl,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '风格提炼失败');
      }

      try {
        const usedModel = data.model || extractModel;
        const usage = data.usage || {};
        const promptTokens = usage.promptTokens || 500;
        const completionTokens = usage.completionTokens || 300;
        recordModelUsage({
          modelId: usedModel,
          modelName: usedModel,
          provider: resolveModelVendor(usedModel),
          type: 'vision',
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          mediaCount: imagesToSend.length,
          success: true,
        });
      } catch {}

      setExtractedRecipe(data.recipe);
      showToast('🎉 AI 风格逆向解构完成！');
    } catch (e: any) {
      alert(formatUserError(e, 'AI 逆向提炼超时，请重试'));
    } finally {
      clearSafeTimeout(t1);
      clearSafeTimeout(t2);
      setIsExtracting(false);
    }
  }, [
    clearSafeTimeout,
    extractModel,
    multimodalModels,
    selectedImages,
    setSafeTimeout,
    showToast,
    userHint,
  ]);

  // 保存至品类配方库
  const handleSaveRecipe = useCallback(async () => {
    if (!extractedRecipe || !extractedRecipe.name || !extractedRecipe.promptSnippet) {
      showToast('请完善配方名称与提示词内容');
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiFetch('/api/catalog/styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: extractedRecipe.name,
          category: extractedRecipe.category,
          tag: extractedRecipe.tag,
          desc: extractedRecipe.desc,
          has_human: extractedRecipe.has_human,
          subject_type: extractedRecipe.subject_type,
          model_persona: extractedRecipe.model_persona,
          promptSnippet: extractedRecipe.promptSnippet,
          coverUrl: selectedImages[0] || '',
          sampleImages: selectedImages.slice(0, 10),
          sourceUrl: linkInput,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || '保存失败');
      }

      showToast('🎉 配方已成功存入本地资产库！');
      if (onRecipeCreated) {
        onRecipeCreated(data.recipe);
      }
      setSafeTimeout(() => {
        onClose();
      }, 600);
    } catch (e: any) {
      alert(formatUserError(e, '保存配方失败'));
    } finally {
      setIsSaving(false);
    }
  }, [
    extractedRecipe,
    linkInput,
    onClose,
    onRecipeCreated,
    selectedImages,
    setSafeTimeout,
    showToast,
  ]);

  const selectedSet = useMemo(() => new Set(selectedImages), [selectedImages]);
  const detectedLinkCount = useMemo(() => {
    return linkInput
      .split(/[\n\r]+/)
      .map((l) => l.trim())
      .filter(Boolean).length;
  }, [linkInput]);

  return {
    sourceType,
    setSourceType,
    linkInput,
    setLinkInput,
    isParsingLink,
    parsedPostTitle,
    parsedImages,
    urlInput,
    setUrlInput,
    selectedImages,
    setSelectedImages,
    selectedSet,
    visibleCount,
    setVisibleCount,
    extractModel,
    setExtractModel,
    multimodalModels,
    userHint,
    setUserHint,
    extractStepText,
    toastMsg,
    isExtracting,
    extractedRecipe,
    setExtractedRecipe,
    categories,
    isCreatingCategory,
    setIsCreatingCategory,
    isCategoryManagerOpen,
    setIsCategoryManagerOpen,
    newCategoryName,
    setNewCategoryName,
    isSaving,
    detectedLinkCount,
    showToast,
    handleCreateNewCategory,
    handleAutoSelectKeyShots,
    handleToggleImage,
    handleParseLink,
    handleFileUpload,
    styleUploadDropProps,
    handleAddUrls,
    handleStartExtract,
    handleSaveRecipe,
  };
}
