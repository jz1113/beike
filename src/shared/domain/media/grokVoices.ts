import { canonicalModelId } from '@shared/domain/models/modelCatalog';

/** Public video API presets; custom audio files require separate xAI partner access. */
export const GROK_VIDEO_VOICES = [
  { id: 'eve', name: 'Eve', description: '活泼明快' },
  { id: 'ara', name: 'Ara', description: '温暖友好' },
  { id: 'leo', name: 'Leo', description: '沉稳有力' },
  { id: 'rex', name: 'Rex', description: '自信清晰' },
  { id: 'sal', name: 'Sal', description: '平顺自然' },
] as const;

export function grokPresetVoicesAllowed(model: string) {
  return /^grok-imagine-video-1[.-]5(?:-preview)?$/i.test(canonicalModelId(model));
}

export function selectedGrokVideoVoice(id?: string) {
  return GROK_VIDEO_VOICES.find((voice) => voice.id === id?.trim().toLowerCase());
}
