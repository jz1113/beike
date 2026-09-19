import {
  APPROVED_MODELS,
  vendorLabel,
} from '@beike/domain/modelCatalog';

export const FALLBACK_FLAGSHIP_MODELS = APPROVED_MODELS.map((m) => ({
  id: m.id,
  name: m.name,
  shortName: m.shortName,
  category: m.capability === 'multimodal' ? 'text' : m.capability,
  isVision: m.capability === 'multimodal',
  isMultimodal: m.capability === 'multimodal',
  isThinking: Boolean(m.isThinking),
  isImage: m.capability === 'image',
  isVideo: m.capability === 'video',
  provider: vendorLabel(m.vendor),
  owned_by: m.vendor,
}));
