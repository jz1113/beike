import { getEnabledMultimodalModelsFromSettings } from '@beike/domain/workflowModels';
import { listApprovedModels } from '@beike/domain/modelCatalog';

export interface KeywordReviewModelOption {
  value: string;
  model: string;
  label: string;
  provider: 'deepseek' | 'gateway';
}

export const DEFAULT_KEYWORD_REVIEW_MODEL = 'deepseek:deepseek-flash';
export const KEYWORD_REVIEW_MODEL_STORAGE_KEY = 'keyword_review_model';

export function loadKeywordReviewModels(): KeywordReviewModelOption[] {
  const configured = getEnabledMultimodalModelsFromSettings();
  const gatewayModels = configured.length > 0 ? configured : listApprovedModels('multimodal');
  return [
    { value: DEFAULT_KEYWORD_REVIEW_MODEL, model: 'deepseek-flash', label: 'DeepSeek Flash · 官方', provider: 'deepseek' },
    ...gatewayModels.map((item) => ({
      value: `gateway:${item.id}`,
      model: item.id,
      label: `${item.name || item.id} · 模型网关`,
      provider: 'gateway' as const,
    })),
  ];
}
