import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@client/store';
import { fetchRecipes, loadSystemConfiguredModels } from '../api/workshopResources';
import { nextWorkshopRecipeSelection } from '../model/workshopResourceRules';

export function useBatchWorkshopResources(setSelectedArchId: (id: string) => void) {
  const [recipes, setRecipes] = useState<any[]>([]);
  // 模型配置
  const [availableVisionModels, setAvailableVisionModels] = useState<any[]>([]);
  const [selectedVisionModel, setSelectedVisionModel] = useState<string>('gemini-3.7-flash');
  const [availableImageModels, setAvailableImageModels] = useState<any[]>([]);
  const [selectedImageGenModel, setSelectedImageGenModel] = useState<string>('gpt-image-2');

  // 资源异步加载
  const fetchRecipesHandler = useCallback(async () => {
    try {
      const visible = await fetchRecipes();
      setRecipes(visible);
      const next = nextWorkshopRecipeSelection(visible, useAppStore.getState().selectedArchId);
      if (next !== null) setSelectedArchId(next);
    } catch {
      setRecipes([]);
    }
  }, [setSelectedArchId]);

  const loadModelsHandler = useCallback(() => {
    const {
      availableVisionModels: vModels,
      selectedVisionModel: sVision,
      availableImageModels: iModels,
      selectedImageGenModel: sImage,
    } = loadSystemConfiguredModels();
    setAvailableVisionModels(vModels);
    setSelectedVisionModel(sVision);
    setAvailableImageModels(iModels);
    setSelectedImageGenModel(sImage);
  }, []);

  useEffect(() => {
    void fetchRecipesHandler();
    loadModelsHandler();
  }, [fetchRecipesHandler, loadModelsHandler]);

  return {
    recipes, availableVisionModels, selectedVisionModel, setSelectedVisionModel,
    availableImageModels, selectedImageGenModel, setSelectedImageGenModel,
  };
}
