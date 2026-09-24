import { jsonResponse } from '../../../core/http';
import { gatewayFetch } from '../../../gateways/http';

const COMFLY_PRICING_URL = 'https://ai.comfly.org/api/pricing';
const CACHE_MS = 5 * 60_000;
let cached: { expiresAt: number; prices: Record<string, { promptPer1k: number; completionPer1k: number }> } | null = null;

/** Comfly 默认分组：报价单的 ฿/K token = model_ratio × 0.002 × group_ratio。 */
export function parseDefaultGroupPrices(raw: unknown): Record<string, { promptPer1k: number; completionPer1k: number }> {
  if (!raw || typeof raw !== 'object') return {};
  const data = raw as Record<string, unknown>;
  const groupRatio = (data.group_ratio as Record<string, unknown> | undefined)?.default;
  if (!Array.isArray(data.data) || typeof groupRatio !== 'number' || !Number.isFinite(groupRatio) || groupRatio <= 0) return {};
  const prices: Record<string, { promptPer1k: number; completionPer1k: number }> = {};
  for (const value of data.data) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    const id = typeof row.model_name === 'string' ? row.model_name.toLowerCase() : '';
    const ratio = row.model_ratio;
    const completion = row.completion_ratio;
    if (!id || row.quota_type !== 0 || !Array.isArray(row.enable_groups) || !row.enable_groups.includes('default')) continue;
    if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || typeof completion !== 'number' || !Number.isFinite(completion) || completion < 0) continue;
    prices[id] = {
      promptPer1k: ratio * groupRatio * 0.002,
      completionPer1k: ratio * completion * groupRatio * 0.002,
    };
  }
  return prices;
}

export async function GET() {
  if (cached && cached.expiresAt > Date.now()) {
    return jsonResponse({ success: true, group: 'default', prices: cached.prices });
  }
  try {
    const response = await gatewayFetch(COMFLY_PRICING_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Comfly HTTP ${response.status}`);
    const raw = await response.json();
    const prices = parseDefaultGroupPrices(raw);
    if (Object.keys(prices).length === 0) throw new Error('Comfly 未返回默认分组报价');
    cached = { prices, expiresAt: Date.now() + CACHE_MS };
    return jsonResponse({ success: true, group: 'default', prices });
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : '获取 Comfly 报价失败' }, 502);
  }
}
