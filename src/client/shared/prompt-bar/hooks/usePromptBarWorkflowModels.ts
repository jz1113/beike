import { useEffect, useState } from 'react';
import { useAppStore } from '@client/store';
import {
  getEnabledImageModelsFromSettings,
  getEnabledVideoModelsFromSettings,
  readWorkflowModelsFromStorage,
} from '@shared/domain/models/workflowModels';

export function usePromptBarWorkflowModels(
  setQuickModel: (id: string) => void,
  setQuickVideoModel: (id: string) => void,
) {
  const [availableImageModels, setAvailableImageModels] = useState<ReturnType<typeof getEnabledImageModelsFromSettings>>([]);
  const [availableVideoModels, setAvailableVideoModels] = useState<ReturnType<typeof getEnabledVideoModelsFromSettings>>([]);

  useEffect(() => {
    const loadCustomModels = () => {
      const all = readWorkflowModelsFromStorage();
      const customImage = getEnabledImageModelsFromSettings(all);
      const customVideo = getEnabledVideoModelsFromSettings(all);

      setAvailableImageModels(customImage);
      if (!customImage.length) setQuickModel('');
      if (customImage.length > 0) {
        const activeModel = useAppStore.getState().quickModel;
        if (activeModel && customImage.some((m) => m.id === activeModel)) {
          /* keep */
        } else {
          const savedImg = localStorage.getItem('ai_image_gen_model');
          if (savedImg && customImage.some((m) => m.id === savedImg)) {
            setQuickModel(savedImg);
          } else {
            setQuickModel(customImage[0].id as string);
          }
        }
      }

      setAvailableVideoModels(customVideo);
      if (!customVideo.length) setQuickVideoModel('');
      if (customVideo.length > 0) {
        const activeVid = useAppStore.getState().quickVideoModel;
        if (activeVid && customVideo.some((m) => m.id === activeVid)) {
          /* keep */
        } else {
          const savedVid = localStorage.getItem('ai_video_gen_model');
          if (savedVid && customVideo.some((m) => m.id === savedVid)) {
            setQuickVideoModel(savedVid);
          } else {
            setQuickVideoModel(customVideo[0].id as string);
          }
        }
      }
    };

    loadCustomModels();
    window.addEventListener('models_updated', loadCustomModels);
    return () => window.removeEventListener('models_updated', loadCustomModels);
  }, [setQuickModel, setQuickVideoModel]);

  return { availableImageModels, availableVideoModels };
}
