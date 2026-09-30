import { useEffect, useState } from 'react';
import { getEnabledImageModelsFromSettings } from '@shared/domain/models/workflowModels';

export function useLightboxImageModels(selectedModelId?: string, onSelectModel?: (id: string) => void) {
  const [availableImageModels, setAvailableImageModels] = useState(() => getEnabledImageModelsFromSettings());
  useEffect(() => {
    const loadModels = () => setAvailableImageModels(getEnabledImageModelsFromSettings());
    loadModels();
    window.addEventListener('models_updated', loadModels);
    return () => window.removeEventListener('models_updated', loadModels);
  }, []);
  useEffect(() => {
    if (!onSelectModel || selectedModelId === undefined || availableImageModels.some(model => model.id === selectedModelId)) return;
    const saved = localStorage.getItem('ai_image_gen_model');
    const fallback = availableImageModels.find(model => model.id === saved)?.id || availableImageModels[0]?.id || '';
    if (fallback !== selectedModelId) onSelectModel(fallback);
  }, [availableImageModels, selectedModelId, onSelectModel]);
  return availableImageModels;
}
