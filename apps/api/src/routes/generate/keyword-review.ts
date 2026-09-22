import { KeywordReviewBalanceRequestSchema, KeywordReviewRequestSchema } from '@beike/contracts/generate';
import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { jsonResponse } from '../../core/http';
import { parseJsonBody, readJsonBody } from '../../core/validate';
import {
  fetchDeepSeekBalance,
  KEYWORD_REVIEW_DEEPSEEK_BASE_URL,
  KEYWORD_REVIEW_DEEPSEEK_MODEL,
  reviewKeywordRows,
} from '../../services/keywordReview';

function readDeepSeekKey(body: { customBaseUrl?: string; customApiKey?: string }) {
  const baseUrl = normalizeGatewayBaseUrl(body.customBaseUrl);
  if (baseUrl !== KEYWORD_REVIEW_DEEPSEEK_BASE_URL) {
    return { ok: false as const, response: jsonResponse({ success: false, error: '关键词审核只接受 DeepSeek 官方接口，请到设置里填写 DeepSeek API Key' }, 400) };
  }
  const apiKey = body.customApiKey?.trim() || '';
  if (!apiKey) {
    return { ok: false as const, response: jsonResponse({ success: false, error: '未配置 DeepSeek API Key，请到设置里的 DeepSeek 官方服务填写' }, 400) };
  }
  return { ok: true as const, baseUrl, apiKey };
}

export async function POST(req: Request): Promise<Response> {
  try {
    let rawBody: unknown;
    try {
      rawBody = await readJsonBody(req);
    } catch {
      return jsonResponse({ success: false, error: '请求数据格式异常' }, 400);
    }
    const parsedBody = parseJsonBody(rawBody, KeywordReviewRequestSchema);
    if (!parsedBody.success) return jsonResponse({ success: false, error: parsedBody.error }, 400);
    const credentials = readDeepSeekKey(parsedBody.data);
    if (!credentials.ok) return credentials.response;
    const { baseUrl, apiKey } = credentials;
    const model = String(parsedBody.data.model || KEYWORD_REVIEW_DEEPSEEK_MODEL).trim() || KEYWORD_REVIEW_DEEPSEEK_MODEL;
    if (model !== KEYWORD_REVIEW_DEEPSEEK_MODEL) {
      return jsonResponse({ success: false, error: `关键词审核仅支持 ${KEYWORD_REVIEW_DEEPSEEK_MODEL}` }, 400);
    }
    const reviewed = await reviewKeywordRows({
      baseUrl,
      apiKey,
      model,
      rows: parsedBody.data.rows,
      lookup: parsedBody.data.lookup === true,
    });
    return jsonResponse({
      success: true,
      results: reviewed.results,
      model,
      usage: reviewed.usage,
      lookedUp: reviewed.lookedUp,
    });
  } catch (error) {
    const message = formatUserError(error, '关键词审核失败');
    return jsonResponse({ success: false, error: message }, error instanceof SyntaxError ? 502 : 500);
  }
}

export async function balancePOST(req: Request): Promise<Response> {
  try {
    let rawBody: unknown;
    try {
      rawBody = await readJsonBody(req);
    } catch {
      return jsonResponse({ success: false, error: '请求数据格式异常' }, 400);
    }
    const parsedBody = parseJsonBody(rawBody, KeywordReviewBalanceRequestSchema);
    if (!parsedBody.success) return jsonResponse({ success: false, error: parsedBody.error }, 400);
    const credentials = readDeepSeekKey(parsedBody.data);
    if (!credentials.ok) return credentials.response;
    const balance = await fetchDeepSeekBalance(credentials);
    return jsonResponse({ success: true, ...balance });
  } catch (error) {
    const message = formatUserError(error, '余额查询失败');
    return jsonResponse({ success: false, error: message }, 502);
  }
}
