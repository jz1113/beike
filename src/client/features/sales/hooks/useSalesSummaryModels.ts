import { useEffect, useState } from 'react';
import { loadSystemConfiguredModels, type ConfiguredModelOption } from '@client/shared/models/configuredModels';

export function useSalesSummaryModels(preferred: string) {
  const [options, setOptions] = useState<ConfiguredModelOption[]>([]);
  const [fallback, setFallback] = useState('');
  useEffect(() => {
    const reload = () => {
      try {
        const config = loadSystemConfiguredModels();
        setOptions(config.availableVisionModels);
        setFallback(config.selectedVisionModel);
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
