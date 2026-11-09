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

export function officialVideoProvider(baseUrl?: string): 'seedance' | 'kling' | 'vidu' | 'grok' | undefined {
  try {
    const host = new URL(baseUrl || '').hostname.toLowerCase();
    if (/^ark\.[\w-]+\.volces\.com$/.test(host)) return 'seedance';
    if (['api.klingai.com', 'api-beijing.klingai.com', 'api-singapore.klingai.com'].includes(host)) return 'kling';
    if (['api.vidu.cn', 'api.vidu.com'].includes(host)) return 'vidu';
    if (host === 'api.x.ai' || host.endsWith('.api.x.ai')) return 'grok';
  } catch { /* Custom gateway URLs are validated by their caller. */ }
}

export function isComflyVideoBase(baseUrl?: string): boolean {
  try { return ['ai.comfly.org', 'comfly.org'].includes(new URL(baseUrl || '').hostname.toLowerCase()); }
  catch { return false; }
}
