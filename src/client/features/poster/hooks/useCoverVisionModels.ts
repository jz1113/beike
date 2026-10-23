import { useCallback, useEffect, useState } from 'react';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import { coverReasoningEffort, readCoverReasoningMap, rememberCoverReasoning } from '../model/coverReasoning';
import { coverVisionModelLabel, listCoverVisionModels, type CoverVisionModel } from '../model/coverVisionModels';

export function useCoverVisionModels() {
  const [models, setModels] = useState<CoverVisionModel[]>([]);
  const [selectionId, setSelectionId] = useState('');
  const [reasoning, setReasoning] = useState(readCoverReasoningMap);

  const reload = useCallback(() => {
    const next = listCoverVisionModels();
    setModels(next);
    setSelectionId((current) => next.some((model) => model.selectionId === current && !model.unavailable)
      ? current
      : next.find((model) => !model.unavailable)?.selectionId || '');
  }, []);

  useEffect(() => {
    reload();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('beike_modality_models_v1_') || event.key === 'beike_api_providers_v2' || event.key === 'beike_modality_global_config_v1') reload();
    };
    window.addEventListener('models_updated', reload);
    window.addEventListener('modality_models_updated', reload);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('models_updated', reload);
      window.removeEventListener('modality_models_updated', reload);
      window.removeEventListener('storage', onStorage);
    };
  }, [reload]);

  const selected = models.find((model) => model.selectionId === selectionId);
  const available = selected && !selected.unavailable ? selected : undefined;
  const effort = coverReasoningEffort(available?.modelId || '', available?.textProtocol, reasoning);
  const setEffort = (value: ReasoningEffort) => {
    if (!available) return;
    setReasoning((current) => rememberCoverReasoning(current, available.modelId, value, available.textProtocol));
  };
  return { models, selectionId, setSelectionId, selected, effort, setEffort, label: coverVisionModelLabel(selected) };
}
