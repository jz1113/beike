import { collectProduct } from '../../services/collect/collectProduct';
import { readJsonBody, parseJsonBody } from '../../core/validate';
import { jsonResponse } from '../../core/http';
import { collectBodySchema } from '@shared/contracts/catalog';
import { allowServerSecretFallback } from '@shared/domain/models/gatewayCreds';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

export async function POST(req: Request) {
  try {
    const parsed = parseJsonBody(await readJsonBody(req), collectBodySchema);
    if (!parsed.success) return jsonResponse({ success: false, error: parsed.error }, 400);
    const apiKey = (req.headers.get('x-wanbang-key') || (allowServerSecretFallback() ? process.env.WANBANG_API_KEY : '') || '').trim();
    const apiSecret = (req.headers.get('x-wanbang-secret') || (allowServerSecretFallback() ? process.env.WANBANG_API_SECRET : '') || '').trim();
    const result = await collectProduct(parsed.data, apiKey, apiSecret);
    return jsonResponse(result.body, result.status);
  } catch (error) {
    console.error('[Collect] 路由致命异常:', error);
    return jsonResponse({ error: formatUserError(error, '采集遇到未知异常') }, 500);
  }
}
