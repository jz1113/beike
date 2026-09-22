import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { apiFetch } from '@/shared/api/apiClient';
import { pickVisionAnalyzeFallbacks, PreviousGroupSignature } from '@beike/domain/vision';
import { normalizeImageUrlToStandardJpg } from '@beike/domain/drawing';
import { getGatewayClientOverrides } from '@/shared/api/gatewayClient';
import { recordModelUsage, resolveModelVendor } from '@/shared/utils/usageTracker';
import { buildJewelryTemplateStyle, isJewelryProductTitle } from '@beike/domain/jewelryArch';
import type { BatchProductItem } from './batchTypes';
import { formatAnalyzedStoryboard } from './batchVisionAnalyzeFormat';

export type VisionAnalyzeDeps = {
  recipes: Array<{ id: string; name: string; category?: string; promptSnippet?: string }>;
  selectedArchId: string;
  items?: BatchProductItem[];
  lockedPersonaId: string;
  lockedSceneId: string;
  lockedOutfitId: string;
  lockedActionId: string;
  lockedFullPromptId?: string;
  selectedShotCount: number;
  selectedVisionModel: string;
  availableVisionModels?: Array<{ id: string }>;
  useAssetLibrary?: boolean;
  availablePersonas?: unknown[];
  availableScenes?: unknown[];
  availableOutfits?: unknown[];
  personaMode?: 'asset_driven' | 'none';
  setItems?: Dispatch<SetStateAction<BatchProductItem[]>>;
  getItems?: () => BatchProductItem[];
  batchGroupSignaturesRef?: MutableRefObject<PreviousGroupSignature[]>;
  batchActionIdsRef?: MutableRefObject<string[]>;
  batchSceneIdsRef?: MutableRefObject<string[]>;
  batchId?: string;
};

export async function analyzeBatchProduct(
  deps: VisionAnalyzeDeps,
  item: BatchProductItem,
  itemIndex?: number,
  allocatedAsset?: {
    scene?: any;
    outfit?: any;
    persona?: any;
    actions?: any[];
  }
): Promise<boolean> {
    const archObj = deps.recipes.find(r => r.id === deps.selectedArchId);
    if (!archObj) {
      throw new Error('未确认有效的类目拍摄架构，无法开始提示词分析');
    }
    const mode = 'storyboard_generate';

    const chosenProductImgs = item.selectedProductImages.length > 0
      ? item.selectedProductImages
      : [item.coverImage];
    const imagePayload = chosenProductImgs.map(normalizeImageUrlToStandardJpg);

    const effectivePersona = deps.personaMode === 'none' ? 'none' : 'asset_driven';

    const { customBaseUrl: localUrl, customApiKey: localApiKey } = getGatewayClientOverrides();
    const targetShotCount = deps.selectedShotCount || 4;

    let data: any = null;
    let apiError: string | null = null;

    const lockedAssets = (deps.lockedPersonaId !== 'auto' || deps.lockedSceneId !== 'auto' || deps.lockedOutfitId !== 'auto' || deps.lockedActionId !== 'auto' || (deps.lockedFullPromptId && deps.lockedFullPromptId !== 'auto')) ? {
      personaId: deps.lockedPersonaId !== 'auto' ? deps.lockedPersonaId : undefined,
      sceneId: deps.lockedSceneId !== 'auto' ? deps.lockedSceneId : undefined,
      outfitId: deps.lockedOutfitId !== 'auto' ? deps.lockedOutfitId : undefined,
      actionId: deps.lockedActionId !== 'auto' ? deps.lockedActionId : undefined,
      fullPromptId: deps.lockedFullPromptId && deps.lockedFullPromptId !== 'auto' ? deps.lockedFullPromptId : undefined,
    } : undefined;

    const computedProductIdx = typeof itemIndex === 'number'
      ? itemIndex
      : (deps.items ? deps.items.findIndex(p => p.id === item.id) : 0);

    const isJewelryArch =
      deps.selectedArchId === 'recipe_jewelry_master' ||
      deps.selectedArchId === 'arch_jewelry_master' ||
      archObj.id === 'recipe_jewelry_master' ||
      /珠宝|jewelry/i.test(String(archObj.category || ''));
    const jewelryProduct = isJewelryProductTitle(item.title, item.props);
    const templateStyle = isJewelryArch && jewelryProduct
      ? buildJewelryTemplateStyle(archObj.name, archObj.promptSnippet || '', item.title, item.props)
      : `${archObj.name} \n${archObj.promptSnippet || ''}`;

    deps.setItems?.(prev => prev.map(p => (
      p.id === item.id ? { ...p, isAnalyzing: true, analysisError: undefined } : p
    )));

    try {
      const res = await apiFetch('/api/generate/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          productTitle: item.title || '优质电商商品',
          productProps: item.props || {},
          productIndex: Math.max(0, computedProductIdx),
          imageUrls: imagePayload,
          modelPersona: effectivePersona,
          templateStyle,
          useAssetLibrary: deps.useAssetLibrary,
          lockedAssets,
          allocatedAssets: allocatedAsset ? {
            sceneId: allocatedAsset.scene?.id,
            outfitId: allocatedAsset.outfit?.id,
            personaId: allocatedAsset.persona?.id,
            actionIds: allocatedAsset.actions?.map((a: any) => a.id),
          } : undefined,
          extraRequirements: `- 🚨【分镜数量严格保证】：必须输出完整的 ${targetShotCount} 个分镜，数组 prompts 长度必须严格等于 ${targetShotCount}！\n- 🚨【商品外观唯一锚定 @图片1】：美学置景与构图写入文字，生图只垫商品图。`,
          shotCount: targetShotCount,
          model: deps.selectedVisionModel,
          fallbackModels: pickVisionAnalyzeFallbacks(
            deps.selectedVisionModel,
            (deps.availableVisionModels || []).map(m => m.id).filter(Boolean)
          ),
          customBaseUrl: localUrl,
          customApiKey: localApiKey,
          previousGroupSignatures: deps.batchGroupSignaturesRef?.current?.slice(-4) || [],
          previousActionIds: deps.batchActionIdsRef?.current?.slice(-16) || [],
          previousSceneIds: deps.batchSceneIdsRef?.current?.slice(-20) || [],
          batchId: deps.batchId,
        })
      });

      data = await res.json().catch(() => ({ error: `视觉分析接口响应解析异常 (HTTP ${res.status})` }));
      if (!res.ok || data?.error || !data?.prompts || data.prompts.length === 0) {
        apiError = data?.error || `视觉大模型响应异常 (HTTP ${res.status})`;
      }
    } catch (err: any) {
      apiError = err.message || '视觉分析请求超时或网络异常';
    }

    if (apiError || !data?.prompts || data.prompts.length === 0) {
      deps.setItems?.(prev => prev.map(p => {
        if (p.id !== item.id) return p;
        return {
          ...p,
          isAnalyzing: false,
          analyzedSuccess: false,
          analysisError: apiError || '视觉模型未返回有效分镜',
          prompts: []
        };
      }));
      throw new Error(apiError || '视觉模型未返回有效分镜');
    }

    const returnedCount = Array.isArray(data.prompts) ? data.prompts.length : 0;
    if (returnedCount < targetShotCount) {
      const analysisError = `仅返回 ${returnedCount} 个分镜，需要 ${targetShotCount} 个，请重新分析`;
      deps.setItems?.(prev => prev.map(p => (
        p.id === item.id
          ? { ...p, isAnalyzing: false, analyzedSuccess: false, analysisError, prompts: [] }
          : p
      )));
      throw new Error(analysisError);
    }

    const latest = deps.getItems?.().find(p => p.id === item.id);
    if (latest && JSON.stringify(latest.selectedProductImages || []) !== JSON.stringify(item.selectedProductImages || [])) {
      const analysisError = '图片已更改，请重新分析商品';
      deps.setItems?.(prev => prev.map(p => (
        p.id === item.id ? { ...p, isAnalyzing: false, analyzedSuccess: false, analysisError } : p
      )));
      throw new Error(analysisError);
    }

    // 🌟 记录多模态视觉模型真实调用与 Token 吞吐
    try {
      const usedModel = data?.modelUsed || deps.selectedVisionModel;
      const usageTokens = data?.usage || {};
      const promptTokens = usageTokens.promptTokens || usageTokens.prompt_tokens || 0;
      const completionTokens = usageTokens.completionTokens || usageTokens.completion_tokens || 0;
      const totalTokens = usageTokens.totalTokens || usageTokens.total_tokens || (promptTokens + completionTokens);

      recordModelUsage({
        modelId: usedModel,
        modelName: usedModel,
        provider: resolveModelVendor(usedModel),
        type: 'vision',
        promptTokens,
        completionTokens,
        totalTokens,
        mediaCount: imagePayload.length,
        success: true,
      });
    } catch {}

    const digest = (data?.prompts || [])
      .map((s: any) => [s.expression, s.action].filter(Boolean).join('/'))
      .filter(Boolean)
      .join(' | ');
    const masterFromApi = data?.masterScene || data?.master_scene || '';
    const lookFromApi = data?.lookBible || data?.look_bible || '';
    if (deps.batchGroupSignaturesRef && (masterFromApi || digest || lookFromApi)) {
      deps.batchGroupSignaturesRef.current = [
        ...deps.batchGroupSignaturesRef.current,
        { scene: masterFromApi, actionDigest: digest, lookBible: lookFromApi },
      ].slice(-6);
    }
    if (deps.batchActionIdsRef && Array.isArray(data?.usedActionIds) && data.usedActionIds.length > 0) {
      deps.batchActionIdsRef.current = [
        ...deps.batchActionIdsRef.current,
        ...data.usedActionIds.map(String),
      ].slice(-24);
    }
    if (deps.batchSceneIdsRef && data?.selectedSceneId) {
      deps.batchSceneIdsRef.current = [
        ...deps.batchSceneIdsRef.current,
        String(data.selectedSceneId),
      ].slice(-24);
    }

    const lookPartsFromApi = data?.lookParts || data?.look_parts || null;
    const formatted = formatAnalyzedStoryboard({
      data,
      item,
      imagePayload,
    });

    deps.setItems?.(prev => prev.map(p => {
      if (p.id !== item.id) return p;
      return {
        ...p,
        isAnalyzing: false,
        analyzedSuccess: true,
        analysisError: apiError || undefined,
        lookBible: formatted.lookBible,
        identityBible: formatted.identityBible,
        styleBible: formatted.styleBible,
        masterScene: formatted.masterScene,
        applied_scene: data?.applied_scene || data?.appliedScene,
        applied_outfit: data?.applied_outfit || data?.appliedOutfit,
        applied_persona: data?.applied_persona || data?.appliedPersona,
        productRole: formatted.productRole,
        productFingerprint: formatted.productFingerprint,
        lookParts: formatted.lookParts ?? lookPartsFromApi,
        prompts: formatted.formattedPrompts,
        gridPrompt: formatted.gridPrompt,
      };
    }));

    return true;
  }

export async function runBatchVisionAnalyze(opts: {
  items: BatchProductItem[];
  concurrency: number;
  isAborted: () => boolean;
  analyzeOne: (item: BatchProductItem, index: number) => Promise<void>;
  onItemStart: (item: BatchProductItem) => void;
  onItemFinish: (finished: number, total: number) => void;
  onItemError: (item: BatchProductItem, err: unknown) => void;
}): Promise<number> {
  let successAnalyzed = 0;
  let finishedCount = 0;
  let itemIdx = 0;
  const concurrency = Math.min(opts.concurrency || 16, opts.items.length);

  const worker = async () => {
    while (itemIdx < opts.items.length && !opts.isAborted()) {
      const currentItemIdx = itemIdx++;
      const item = opts.items[currentItemIdx];
      if (!item) break;
      opts.onItemStart(item);
      try {
        await opts.analyzeOne(item, currentItemIdx);
        successAnalyzed++;
      } catch (err) {
        opts.onItemError(item, err);
      } finally {
        finishedCount++;
        opts.onItemFinish(finishedCount, opts.items.length);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return successAnalyzed;
}
