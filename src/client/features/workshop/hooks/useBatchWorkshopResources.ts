import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@client/store';
import { fetchRecipes, loadSystemConfiguredModels } from '../api/workshopResources';
import { nextWorkshopRecipeSelection } from '../model/workshopResourceRules';

export function useBatchWorkshopResources(setSelectedArchId: (id: string) => void) {
  const recipeRequest = useRef(0);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [skillLoadState, setSkillLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [skillLoadError, setSkillLoadError] = useState('');
  // 模型配置
  const [availableVisionModels, setAvailableVisionModels] = useState<any[]>([]);
  const [selectedVisionModel, setSelectedVisionModel] = useState<string>('gemini-3.7-flash');
  const [availableImageModels, setAvailableImageModels] = useState<any[]>([]);
  const [selectedImageGenModel, setSelectedImageGenModel] = useState<string>('gpt-image-2');

  // 资源异步加载
  const fetchRecipesHandler = useCallback(async () => {
    const request = ++recipeRequest.current;
    setSkillLoadState('loading');
    setSkillLoadError('');
    try {
      const visible = await fetchRecipes();
      if (request !== recipeRequest.current) return;
      setRecipes(visible);
      setSkillLoadState('ready');
      const next = nextWorkshopRecipeSelection(visible, useAppStore.getState().selectedArchId);
      if (next !== null) setSelectedArchId(next);
    } catch (error) {
      if (request === recipeRequest.current) {
        setRecipes([]); setSkillLoadState('error');
        setSkillLoadError(error instanceof Error ? error.message : '创作技能加载失败');
      }
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
    setSelectedVisionModel((prev) => (vModels.some((m) => m.id === prev) ? prev : sVision));
    setAvailableImageModels(iModels);
    setSelectedImageGenModel((prev) => (iModels.some((m) => m.id === prev) ? prev : sImage));
  }, []);

  useEffect(() => {
    void fetchRecipesHandler();
    loadModelsHandler();
    const refresh = () => { void fetchRecipesHandler(); };
    window.addEventListener('workshop-recipes-changed', refresh);
    window.addEventListener('models_updated', loadModelsHandler);
    window.addEventListener('modality_models_updated', loadModelsHandler);
    return () => {
      recipeRequest.current += 1;
      window.removeEventListener('workshop-recipes-changed', refresh);
      window.removeEventListener('models_updated', loadModelsHandler);
      window.removeEventListener('modality_models_updated', loadModelsHandler);
    };
  }, [fetchRecipesHandler, loadModelsHandler]);

  return {
    recipes, skillLoadState, skillLoadError, reloadSkills: fetchRecipesHandler, availableVisionModels, selectedVisionModel, setSelectedVisionModel,
    availableImageModels, selectedImageGenModel, setSelectedImageGenModel,
  };
}
