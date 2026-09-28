import { getEnabledMultimodalModelsFromSettings, type WorkflowCapability } from '@shared/domain/models/workflowModels';
import { normalizeMultimodalFallbackOrder } from '@shared/domain/models/modelCatalog';
export const FALLBACK_ORDER_KEY = 'multimodal_fallback_order_v1';
export function readFallbackOrder(): string[] | undefined {
  try { return normalizeMultimodalFallbackOrder(JSON.parse(localStorage.getItem(FALLBACK_ORDER_KEY) || 'null')); }
  catch { return undefined; }
}
export function resolveFallbackOrder(models: WorkflowCapability[], saved = readFallbackOrder()): string[] {
  const eligible = getEnabledMultimodalModelsFromSettings(models)
    .filter(model => (model.channel ?? 'comfly') === 'comfly' && !model.id.startsWith('openai-responses:'));
  const ids = Array.from(new Set(eligible.map(model => model.id)));
  const allowed = new Set(ids);
  return [...(saved ?? []).filter(id => allowed.has(id)), ...ids.filter(id => !saved?.includes(id))];
}
export function readEffectiveFallbackOrder(): string[] | undefined {
  try {
    const models = JSON.parse(localStorage.getItem('custom_models') || 'null');
    return Array.isArray(models) ? resolveFallbackOrder(models) : undefined;
  } catch { return undefined; }
}
const supported = new Set(['/api/generate/analyze', '/api/generate/copywriting', '/api/catalog/assets/deconstruct', '/api/catalog/styles/extract', '/api/assistant/turn/start']);
export function withFallbackOrder(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (typeof input !== 'string' || !supported.has(input.split('?')[0]) || init?.method?.toUpperCase() !== 'POST' || typeof init.body !== 'string') return init;
  const order = readEffectiveFallbackOrder();
  if (!order) return init;
  try {
    const body = JSON.parse(init.body);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return init;
    return { ...init, body: JSON.stringify({ ...body, fallbackOrder: order }) };
  } catch { return init; }
}
