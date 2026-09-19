import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
export type CanvasToolQuality = '1K' | '2K' | '4K';
const qualityToLabel = (quality?: string): CanvasToolQuality => quality === 'low' ? '1K' : quality === 'high' ? '4K' : '2K';
/** Model/quality/aspect selection shared by canvas image tools. */
export function useCanvasToolConfig(syncEnabled = true) {
  const { quickModel, quickQuality, quickAspectId, setQuickModel, setQuickQuality, setQuickAspectId } = useAppStore();
  const [selectedModelId, setSelectedModelId] = useState(() => quickModel || 'gpt-image-2');
  const [selectedQuality, setSelectedQuality] = useState<CanvasToolQuality>(() => qualityToLabel(quickQuality));
  const [selectedAspectId, setSelectedAspectId] = useState(() => quickAspectId || 'smart');
  useEffect(() => {
    if (!syncEnabled) return;
    if (quickModel) setSelectedModelId(quickModel);
    if (quickQuality) setSelectedQuality(qualityToLabel(quickQuality));
    if (quickAspectId) setSelectedAspectId(quickAspectId);
  }, [syncEnabled, quickModel, quickQuality, quickAspectId]);
  return {
    selectedModelId, selectedQuality, selectedAspectId,
    handleSelectModel(id: string) {
      setSelectedModelId(id); setQuickModel(id);
      try { localStorage.setItem('ai_image_gen_model', id); } catch { /* optional preference */ }
    },
    handleSelectQuality(quality: CanvasToolQuality) {
      setSelectedQuality(quality);
      setQuickQuality(quality === '1K' ? 'low' : quality === '4K' ? 'high' : 'medium');
    },
    handleSelectAspect(id: string) { setSelectedAspectId(id); setQuickAspectId(id); },
  };
}
