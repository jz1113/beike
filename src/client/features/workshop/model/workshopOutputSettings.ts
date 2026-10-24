import { normalizeOpenAiImageRequest } from '@shared/domain/models/model-adapters/image/normalizeOpenAiImageModel';
import { resolveWorkshopImageSize } from './generation/workshopImageSize';

type Quality = 'low' | 'medium' | 'high';

/** Settings preview shares the generation request's normalization, including fixed-size routes. */
export function workshopOutputSettings(model: string, aspect: string, quality: Quality) {
  const choices = ([['low', '标准'], ['medium', '精细'], ['high', '高清']] as const).map(([value, label]) => ({
    value, label, size: resolveWorkshopImageSize(aspect, model, value),
  }));
  return {
    choices,
    size: choices.find(choice => choice.value === quality)!.size,
    fixedQuality: Boolean(normalizeOpenAiImageRequest(model, undefined, quality, aspect).omitQuality),
  };
}

/** Include every supported value so restored preferences never render as an empty select. */
export const WORKSHOP_ANALYSIS_CONCURRENCY = [1, 2, 3, 4, 5, 6];
export const WORKSHOP_IMAGE_CONCURRENCY = Array.from({ length: 50 }, (_, index) => index + 1);
