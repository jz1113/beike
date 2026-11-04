import { canonicalModelId } from '@shared/domain/models/modelCatalog';

/** Capabilities are channel-specific; lookalike hosts must not inherit Metaso limits. */
export function isMetasoH3(model: string, baseUrl?: string): boolean {
  if (canonicalModelId(model).toLowerCase() !== 'minimax-h3' || !baseUrl) return false;
  try {
    return new URL(baseUrl).hostname.toLowerCase() === 'metaso.cn';
  } catch {
    return false;
  }
}

export function isMiniMaxOfficialBase(baseUrl?: string): boolean {
  if (!baseUrl) return false;
  try {
    return ['api.minimax.cn', 'api.minimaxi.com', 'api.minimax.io'].includes(new URL(baseUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}
