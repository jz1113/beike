import { useEffect, useState } from 'react';
import { modalityPickerSelections, readEffectiveModalityModels, type ModalityPickerSelection } from '@shared/domain/models/modalityStorage';

function readOptions(kind: 'video' | 'voice'): ModalityPickerSelection[] {
  try {
    return modalityPickerSelections(kind) ?? readEffectiveModalityModels(kind).models.map((model) => ({
      id: model.modelId, modelId: model.modelId, entryId: model.id, name: model.name,
    }));
  } catch { return []; }
}

export function useSalesProductionModels() {
  const [models, setModels] = useState(() => ({ videoModels: readOptions('video'), voiceModels: readOptions('voice') }));
  useEffect(() => {
    const reload = () => setModels({ videoModels: readOptions('video'), voiceModels: readOptions('voice') });
    window.addEventListener('models_updated', reload);
    window.addEventListener('modality_models_updated', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('models_updated', reload);
      window.removeEventListener('modality_models_updated', reload);
      window.removeEventListener('storage', reload);
    };
  }, []);
  return models;
}
