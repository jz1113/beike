import { jsonResponse } from '../../../core/http';
import { readJsonBody } from '../../../core/validate';
import { allowServerSecretFallback } from '@shared/domain/models/gatewayCreds';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { parseSocialLink } from '../../../services/collect/parseSocialLink';
import { socialLinkBodyError } from '../../../services/collect/socialMediaSupport';

export async function POST(req: Request) {
  try {
    let body: Record<string, unknown>;
    try { body = await readJsonBody(req); }
    catch {
      if (req.signal.aborted) return jsonResponse({ success: false, error: '采集已取消' }, 499);
      return jsonResponse({ success: false, error: '请求体必须为有效的 JSON' }, 400);
    }
    const bodyError = socialLinkBodyError(body);
    if (bodyError) return jsonResponse({ success: false, error: bodyError }, 400);
    const {
      scraperId, customScraperId, scraperSecret, customApiKey,
      qiyunAppId, qiyunAppKey, customQiyunAppId, customQiyunAppKey,
    } = body as Record<string, string | undefined>;
    const fallback = allowServerSecretFallback();
    const qAppId = (qiyunAppId || customQiyunAppId || req.headers.get('x-qiyun-appid') || (fallback ? process.env.QIYUN_APP_ID : '') || '').trim();
    const qAppKey = (qiyunAppKey || customQiyunAppKey || req.headers.get('x-qiyun-appkey') || (fallback ? process.env.QIYUN_APP_KEY : '') || '').trim();
    const apiaSecret = (scraperSecret || customApiKey || req.headers.get('x-apia-secret-key') || (fallback ? process.env.EXTERNAL_SCRAPER_SECRET : '') || '').trim();
    const apiaClient = (scraperId || customScraperId || req.headers.get('x-apia-client-id') || (fallback ? process.env.EXTERNAL_SCRAPER_ID : '') || '').trim();
    const result = await parseSocialLink(body, { qAppId, qAppKey, apiaSecret, apiaClient }, req.signal);
    return jsonResponse(result.body, result.status);
  } catch (error: unknown) {
    if (req.signal.aborted) return jsonResponse({ success: false, error: '采集已取消' }, 499);
    console.error('[ParseLink] 全局异常:', error);
    return jsonResponse({ error: formatUserError(error, '解析遇到未知错误') }, 500);
  }
}
