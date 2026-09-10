import { useEffect, useState } from 'react';
import { getEnabledImageModelsFromSettings, readWorkflowModelsFromStorage } from '@beike/shared/workflowModels';

export function useLightboxImageModels() {
  // 获取启用的生图模型列表
  const [availableImageModels, setAvailableImageModels] = useState<any[]>(() => {
    try {
      const list = getEnabledImageModelsFromSettings();
      if (list && list.length > 0) return list;
    } catch {}
    return [
      { id: 'gpt-image-2', name: 'GPT Image 2', provider: 'OpenAI', isPrimary: true },
      { id: 'midjourney-v6', name: 'Midjourney v6', provider: 'Midjourney' },
      { id: 'flux-1-dev', name: 'FLUX.1 Dev', provider: 'BFL' },
    ];
  });

  useEffect(() => {
    const loadModels = () => {
      try {
        const all = readWorkflowModelsFromStorage();
        const customImage = getEnabledImageModelsFromSettings(all);
        if (customImage && customImage.length > 0) {
          setAvailableImageModels(customImage);
        }
      } catch {}
    };
    window.addEventListener('models_updated', loadModels);
    return () => window.removeEventListener('models_updated', loadModels);
  }, []);

  return availableImageModels;
}
