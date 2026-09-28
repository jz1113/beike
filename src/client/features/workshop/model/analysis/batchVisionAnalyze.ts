import { workshopAnalysisBlockReason, type AnalysisPreflightConfig } from './workshopAnalysisPreflight';
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { PreviousGroupSignature } from '@shared/domain/prompts/vision';
import { normalizeImageUrlToStandardJpg } from '@shared/domain/media/drawing';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { isOpenAIModelRouteId, requestModelId } from '@shared/domain/models/workflowModels';
import { recordModelUsage, resolveModelVendor } from '@client/shared/utils/usageTracker';
import { buildJewelryTemplateStyle, isJewelryProductTitle } from '@shared/domain/products/jewelryArch';
import { isAutoPromptGroupSelection, promptGroupAppearanceFilter } from '@shared/domain/workshop/workshopPipeline';
import type { BatchProductItem } from '../batchTypes';
import { formatAnalyzedStoryboard } from './batchVisionAnalyzeFormat';
export { runBatchVisionAnalyze } from './batchVisionAnalyzeQueue';

export type VisionAnalyzeDeps = Omit<AnalysisPreflightConfig, 'recipes'> & {
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
  personaMode?: 'asset_driven' | 'none';
  setItems?: Dispatch<SetStateAction<BatchProductItem[]>>;
  getItems?: () => BatchProductItem[];
  getConfigRevision?: () => number;
  batchGroupSignaturesRef?: MutableRefObject<PreviousGroupSignature[]>;
  batchActionIdsRef?: MutableRefObject<string[]>;
  batchSceneIdsRef?: MutableRefObject<string[]>;
  batchId?: string;
};

const analyzeEpochs = new Map<string, number>();
const analyzeControllers = new Map<string, AbortController>();

function beginProductAnalyze(itemId: string) {
  const epoch = (analyzeEpochs.get(itemId) || 0) + 1;
  analyzeEpochs.set(itemId, epoch);
  analyzeControllers.get(itemId)?.abort();
  const controller = new AbortController();
  analyzeControllers.set(itemId, controller);
  return { epoch, signal: controller.signal };
}

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
    const blockReason = workshopAnalysisBlockReason(deps, item);
    if (blockReason) {
      deps.setItems?.(prev => prev.map(row => row.id === item.id ? { ...row, analysisError: blockReason } : row));
      throw new Error(blockReason);
    }
    const archObj = deps.recipes.find(r => r.id === deps.selectedArchId);
    if (!archObj) {
      throw new Error('未确认有效的类目拍摄架构，无法开始提示词分析');
    }
    const mode = 'storyboard_generate';

    const chosenProductImgs = item.selectedProductImages.filter(url => url.trim());
    const imagePayload = chosenProductImgs.map(normalizeImageUrlToStandardJpg);

    const effectivePersona = deps.personaMode || 'asset_driven';

    const { customBaseUrl: localUrl, customApiKey: localApiKey, apiFormat, allowInsecureHttp } = getMultimodalClientOverrides(deps.selectedVisionModel);
    const targetShotCount = deps.selectedShotCount || 4;

    let data: any = null;
    let apiError: string | null = null;

    const groupAppearance = promptGroupAppearanceFilter(deps.lockedFullPromptId);
    const fullPromptId = !isAutoPromptGroupSelection(deps.lockedFullPromptId) ? deps.lockedFullPromptId : undefined;
    const lockedAssets = (deps.lockedPersonaId !== 'auto' || deps.lockedSceneId !== 'auto' || deps.lockedOutfitId !== 'auto' || fullPromptId || groupAppearance) ? {
      personaId: deps.lockedPersonaId !== 'auto' ? deps.lockedPersonaId : undefined,
      sceneId: deps.lockedSceneId !== 'auto' ? deps.lockedSceneId : undefined,
      outfitId: deps.lockedOutfitId !== 'auto' ? deps.lockedOutfitId : undefined,
      fullPromptId,
      groupAppearance,
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

    const analyzeRun = beginProductAnalyze(item.id);
    const configSignature = JSON.stringify({
      revision: deps.getConfigRevision?.(),
      arch: deps.selectedArchId,
      shots: targetShotCount,
      persona: deps.lockedPersonaId,
      scene: deps.lockedSceneId,
      outfit: deps.lockedOutfitId,
      fullPrompt: deps.lockedFullPromptId || 'auto',
      images: item.selectedProductImages || [],
    });
    deps.setItems?.(prev => prev.map(p => (
      p.id === item.id ? { ...p, isAnalyzing: true, analysisError: undefined } : p
    )));

    try {
      const res = await apiFetch('/api/generate/analyze', {
        method: 'POST',
        signal: analyzeRun.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          productTitle: item.title || '优质电商商品',
          productProps: item.props || {},
          productIndex: Math.max(0, computedProductIdx),
          imageUrls: imagePayload,
          modelPersona: effectivePersona,
          templateStyle,
          useAssetLibrary: deps.useAssetLibrary !== false,
          lockedAssets,
          allocatedAssets: allocatedAsset ? {
            sceneId: allocatedAsset.scene?.id,
            outfitId: allocatedAsset.outfit?.id,
            personaId: allocatedAsset.persona?.id,
          } : undefined,
          extraRequirements: `- 🚨【分镜数量严格保证】：必须输出完整的 ${targetShotCount} 个分镜，数组 prompts 长度必须严格等于 ${targetShotCount}！\n- 🚨【商品外观唯一锚定 @图片1】：美学置景与构图写入文字，生图只垫商品图。`,
          shotCount: targetShotCount,
          model: requestModelId(deps.selectedVisionModel),
          customBaseUrl: localUrl,
          customApiKey: localApiKey,
          apiFormat,
          allowInsecureHttp,
          previousGroupSignatures: deps.batchGroupSignaturesRef?.current?.slice(-4) || [],
          previousActionIds: deps.batchActionIdsRef?.current?.slice(-16) || [],
          previousSceneIds: deps.batchSceneIdsRef?.current?.slice(-20) || [],
          batchId: deps.batchId,
          productId: item.id,
        })
      });

      data = await res.json().catch(() => ({ error: `视觉分析接口响应解析异常 (HTTP ${res.status})` }));
      if (!res.ok || data?.error || !Array.isArray(data?.prompts) || data.prompts.length !== targetShotCount || Number(data?.paddedCount) > targetShotCount / 2) {
        apiError = data?.error || `分镜不完整：需要 ${targetShotCount} 镜，实际得到 ${Array.isArray(data?.prompts) ? data.prompts.length : 0} 镜`;
      }
    } catch (err: any) {
      apiError = err.message || '视觉分析请求超时或网络异常';
    }

    if (apiError || !data?.prompts || data.prompts.length === 0) {
      if (analyzeEpochs.get(item.id) !== analyzeRun.epoch) return false;
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

    if (analyzeEpochs.get(item.id) !== analyzeRun.epoch) return false;
    const latestSignature = JSON.stringify({
      revision: deps.getConfigRevision?.(),
      arch: deps.selectedArchId,
      shots: deps.selectedShotCount || 4,
      persona: deps.lockedPersonaId,
      scene: deps.lockedSceneId,
      outfit: deps.lockedOutfitId,
      fullPrompt: deps.lockedFullPromptId || 'auto',
      images: (deps.getItems?.().find(p => p.id === item.id)?.selectedProductImages) || item.selectedProductImages || [],
    });
    if (latestSignature !== configSignature) {
      const analysisError = '配置或选图已变化，本次分析结果已丢弃，请重新分析';
      deps.setItems?.(prev => prev.map(p => (
        p.id === item.id ? { ...p, isAnalyzing: false, analyzedSuccess: false, analysisError } : p
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
        modelId: isOpenAIModelRouteId(deps.selectedVisionModel) ? deps.selectedVisionModel : usedModel,
        modelName: isOpenAIModelRouteId(deps.selectedVisionModel) ? `${usedModel} · OpenAI 渠道` : usedModel,
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

    if (analyzeEpochs.get(item.id) !== analyzeRun.epoch) return false;
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
        appliedFullPromptId: data?.assetTrace?.fullPromptId,
        appliedFullPromptTitle: data?.assetTrace?.fullPromptTitle,
        appliedFullPromptGroupIndex: data?.assetTrace?.fullPromptGroupIndex,
        appliedFullPromptAlbumName: data?.assetTrace?.fullPromptAlbumName,
        appliedFullPromptSelectionMode: data?.assetTrace?.fullPromptSelectionMode,
        appliedFullPromptAppearance: data?.assetTrace?.fullPromptAppearance,
        productRole: formatted.productRole,
        productFingerprint: formatted.productFingerprint,
        lookParts: formatted.lookParts ?? lookPartsFromApi,
        tasks: p.tasks.map(task => ({ ...task, resultStatus: 'superseded' as const })),
        copywriting: undefined,
        masterGridUrl: undefined,
        prompts: formatted.formattedPrompts,
        gridPrompt: formatted.gridPrompt,
      };
    }));

    return true;
  }
