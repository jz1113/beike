import { gatewayFetch } from '../../../gateways/http';
import { jsonResponse } from '../../../core/http';

/** Official directory only: never reuse gateway credentials, aliases or fallback models. */
export async function fetchDeepSeekCatalog(apiKey: unknown) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    return jsonResponse({ success: false, provider: 'deepseek', models: [], error: '请填写 DeepSeek 独立 API Key' }, 400);
  }
  try {
    const response = await gatewayFetch('https://api.deepseek.com/models', {
      headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data?.data)) {
      return jsonResponse({ success: false, provider: 'deepseek', models: [], error: `DeepSeek 模型目录获取失败（HTTP ${response.status}）` }, response.ok ? 502 : response.status);
    }
    const seen = new Set<string>();
    const models = data.data.flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const model = item as Record<string, unknown>;
      if (typeof model.id !== 'string' || !model.id.trim() || seen.has(model.id)) return [];
      seen.add(model.id);
      return [{ id: model.id, name: typeof model.name === 'string' ? model.name : model.id,
        inputModalities: Array.isArray(model.input_modalities) ? model.input_modalities.filter(value => value === 'text' || value === 'image') : [],
      }];
    });
    return jsonResponse({ success: true, provider: 'deepseek', models });
  } catch {
    return jsonResponse({ success: false, provider: 'deepseek', models: [], error: 'DeepSeek 模型目录请求超时或连接失败，请重试' }, 502);
  }
}
