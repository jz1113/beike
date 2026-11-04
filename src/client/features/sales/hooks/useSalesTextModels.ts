import { useEffect, useState } from 'react';
import type { ConfiguredModelOption } from '@client/shared/models/configuredModels';
import { modalityPickerSelections, readEffectiveModalityModels } from '@shared/domain/models/modalityStorage';
import { getEnabledMultimodalModelsFromSettings, getStoredMultimodalModelId, hasWorkflowModelConfiguration, upstreamModelId } from '@shared/domain/models/workflowModels';

/** Selling points and storyboard copy share every configured chat model, including text-only models. */
export function useSalesTextModels(preferred: string) {
  const [options, setOptions] = useState<ConfiguredModelOption[]>([]);
  const [fallback, setFallback] = useState('');
  useEffect(() => {
    const reload = () => {
      try {
        const synced = modalityPickerSelections('chat');
        const chat = readEffectiveModalityModels('chat');
        const legacy = synced ? [] : getEnabledMultimodalModelsFromSettings(undefined, 'assistant');
        const available = synced?.map((item) => ({ id: item.entryId, name: item.name, upstreamId: item.modelId, provider: item.provider }))
          ?? (legacy.length || hasWorkflowModelConfiguration()
            ? legacy.map((item) => ({ id: item.id, name: item.name, upstreamId: upstreamModelId(item.id), provider: item.provider }))
            : chat.models.map((item) => ({ id: item.modelId, name: item.name, upstreamId: item.modelId })));
        const defaultEntry = chat.models.find((item) => item.isDefault);
        const defaultId = synced?.find((item) => item.entryId === defaultEntry?.id)?.entryId || defaultEntry?.modelId || available[0]?.id || '';
        const stored = getStoredMultimodalModelId(defaultId);
        setOptions(available);
        setFallback(available.find((item) => item.id === stored)?.id || available.find((item) => item.upstreamId === stored)?.id || available[0]?.id || '');
      } catch { setOptions([]); setFallback(''); }
    };
    reload();
    window.addEventListener('models_updated', reload);
    window.addEventListener('modality_models_updated', reload);
    window.addEventListener('storage', reload);
    return () => {
      window.removeEventListener('models_updated', reload);
      window.removeEventListener('modality_models_updated', reload);
      window.removeEventListener('storage', reload);
    };
  }, []);
  const model = options.find((option) => option.id === preferred)?.id || options.find((option) => option.upstreamId === preferred)?.id || fallback;
  return { options, model };
}
