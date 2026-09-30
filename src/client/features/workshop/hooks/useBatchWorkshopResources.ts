import { useState, useCallback, useEffect } from 'react';
import { fetchRecipes, loadSystemConfiguredModels } from '../api/workshopResources';

export function useBatchWorkshopResources(setSelectedArchId: (id: string) => void) {
  const [recipes, setRecipes] = useState<any[]>([]);
  // 模型配置
  const [availableVisionModels, setAvailableVisionModels] = useState<any[]>([]);
  const [selectedVisionModel, setSelectedVisionModel] = useState<string>('gemini-3.7-flash');
  const [availableImageModels, setAvailableImageModels] = useState<any[]>([]);
  const [selectedImageGenModel, setSelectedImageGenModel] = useState<string>('gpt-image-2');

  // 资源异步加载
  const fetchRecipesHandler = useCallback(async () => {
    await fetchRecipes(setRecipes, setSelectedArchId);
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
