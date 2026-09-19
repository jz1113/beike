import { apiFetch } from '@/shared/api/apiClient';
import { useAppStore } from '@/store';
import { VISION_MODELS } from '@beike/domain/vision';
import { IMAGE_GEN_MODELS } from '@beike/domain/drawing';
import {
  getEnabledMultimodalModelsFromSettings,
  getEnabledImageModelsFromSettings,
  getStoredMultimodalModelId,
  repairWorkflowModelsInStorage,
} from '@beike/domain/workflowModels';
import { getGlobalAssetLibrary } from '@/features/assets/utils/assetLibraryCache';
import { SYSTEM_MASTER_RECIPES } from './batchTypes';

/**
 * 拉取自定义配方列表并与系统配方合并
 */
export async function fetchRecipes(
  setRecipes: (r: any[]) => void,
  setSelectedArchId: (id: string) => void
): Promise<void> {
  try {
    const res = await apiFetch('/api/catalog/styles');
    const data = await res.json();
    if (data.success && Array.isArray(data.recipes) && data.recipes.length > 0) {
      const customFormatted = data.recipes.map((r: any) => ({
        id: r.id,
        name: r.id === 'recipe_jewelry_master' ? r.name : (r.name.startsWith('🌟 ') ? r.name : `🌟 ${r.name}`),
        category: r.category || '我的专属配方',
        tag: r.tag || '已保存配方',
        promptSnippet: r.promptSnippet || r.prompt_snippet || '',
      }));
      const dbIds = new Set(customFormatted.map((r: { id: string }) => r.id));
      const merged = [
        ...SYSTEM_MASTER_RECIPES.filter((r) => !dbIds.has(r.id)),
        ...customFormatted,
      ];
      setRecipes(merged);
      const prev = useAppStore.getState().selectedArchId;
      if (!merged.some((r) => r.id === prev)) {
        const jewelryArch = merged.find(
          (r) =>
            r.id === 'recipe_jewelry_master' ||
            r.id === 'arch_jewelry_master' ||
            /珠宝首饰/.test(String(r.name))
        );
        setSelectedArchId(jewelryArch?.id || merged[0]?.id || 'recipe_jewelry_master');
      }
    } else {
      setRecipes(SYSTEM_MASTER_RECIPES);
      if (!SYSTEM_MASTER_RECIPES.some((r) => r.id === useAppStore.getState().selectedArchId)) {
        setSelectedArchId(SYSTEM_MASTER_RECIPES[0].id);
      }
    }
  } catch {
    setRecipes(SYSTEM_MASTER_RECIPES);
    if (!SYSTEM_MASTER_RECIPES.some((r) => r.id === useAppStore.getState().selectedArchId)) {
      setSelectedArchId(SYSTEM_MASTER_RECIPES[0].id);
    }
  }
}

/**
 * 加载并计算系统配置的视觉多模态与生图模型
 */
export function loadSystemConfiguredModels(): {
  availableVisionModels: any[];
  selectedVisionModel: string;
  availableImageModels: any[];
  selectedImageGenModel: string;
} {
  repairWorkflowModelsInStorage();

  let availableVisionModels: any[];
  let selectedVisionModel: string;

  const multimodalFromSettings = getEnabledMultimodalModelsFromSettings();
  if (multimodalFromSettings.length > 0) {
    availableVisionModels = multimodalFromSettings.map((m: any) => ({
      id: m.id,
      name: m.name || m.id,
      shortName: m.shortName || (m.name || m.id).split(' ')[0],
      provider: m.provider || '多模态',
    }));
    selectedVisionModel = getStoredMultimodalModelId(availableVisionModels[0].id);
  } else {
    availableVisionModels = VISION_MODELS;
    selectedVisionModel = getStoredMultimodalModelId('gemini-3.7-flash');
  }

  let availableImageModels: any[];
  let selectedImageGenModel: string;

  const imageFromSettings = getEnabledImageModelsFromSettings();
  if (imageFromSettings.length > 0) {
    availableImageModels = imageFromSettings as any[];
    selectedImageGenModel =
      localStorage.getItem('ai_image_gen_model') ||
      (imageFromSettings[0] as any).id ||
      'gpt-image-2';
  } else {
    availableImageModels = IMAGE_GEN_MODELS;
    selectedImageGenModel = localStorage.getItem('ai_image_gen_model') || 'gpt-image-2';
  }

  return {
    availableVisionModels,
    selectedVisionModel,
    availableImageModels,
    selectedImageGenModel,
  };
}

/**
 * 异步拉取全局资产库选项（人像、场景、穿搭）
 */
export async function fetchAssetLibraryOptions(): Promise<{
  personas: any[];
  scenes: any[];
  outfits: any[];
}> {
  try {
    const store = await getGlobalAssetLibrary(false);
    return {
      personas: store.personas || [],
      scenes: store.scenes || [],
      outfits: store.outfits || [],
    };
  } catch (e) {
    console.warn('[Workshop] 获取资产库选项失败:', e);
    return { personas: [], scenes: [], outfits: [] };
  }
}
