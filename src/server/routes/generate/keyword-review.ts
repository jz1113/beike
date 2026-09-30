import { KeywordReviewBalanceRequestSchema, KeywordReviewRequestSchema, KeywordReviewRulesUpdateSchema } from '@shared/contracts/generate';
import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { isApprovedModel } from '@shared/domain/models/modelCatalog';
import { resolveGatewayCreds } from '@shared/domain/models/gatewayCreds';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { jsonResponse } from '../../core/http';
import { parseJsonBody, readJsonBody } from '../../core/validate';
import {
  fetchDeepSeekBalance,
  KEYWORD_REVIEW_DEEPSEEK_BASE_URL,
  KEYWORD_REVIEW_DEEPSEEK_MODEL,
  reviewKeywordRows,
} from '../../services/keywordReview/keywordReview';
import { getKeywordReviewRules, listKeywordReviewRules, publishKeywordReviewRules } from '../../services/keywordReview/keywordReviewRules';
import { DeepSeekApiError, KeywordReviewOutputError } from '../../services/keywordReview/keywordReviewUpstreamError';
import { getDefaultApiKey, getDefaultBaseUrl } from '../../services/models/gatewayCredentials';
import { guardSubmission } from '../../services/tasks/submissionGuard';

export async function rulesGET(): Promise<Response> {
  const workspaceId = requireWorkspaceId();
  const [current, history] = await Promise.all([
    getKeywordReviewRules(workspaceId), listKeywordReviewRules(workspaceId),
  ]);
  return jsonResponse({ success: true, current, history });
}

export async function rulesPUT(req: Request): Promise<Response> {
  let rawBody: unknown;
  try { rawBody = await readJsonBody(req); }
  catch { return jsonResponse({ success: false, error: '请求数据格式异常' }, 400); }
  const parsed = parseJsonBody(rawBody, KeywordReviewRulesUpdateSchema);
  if (!parsed.success) return jsonResponse({ success: false, error: parsed.error }, 400);
  try {
    const current = await publishKeywordReviewRules(requireWorkspaceId(), parsed.data);
    return jsonResponse({ success: true, current });
  } catch (error) {
    if (error instanceof Error && /规则已被其他人更新/.test(error.message)) {
      return jsonResponse({ success: false, error: error.message }, 409);
    }
    throw error;
  }
}

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

function keywordReviewFailure(error: unknown): Response {
  const message = formatUserError(error, '关键词审核失败');
  if (error instanceof DeepSeekApiError) return jsonResponse({ success: false, error: message, code: error.provider === 'DeepSeek' ? 'deepseek_api_error' : 'upstream_api_error' }, error.status);
  if (/审核规则版本 v\d+ 不存在/.test(message)) return jsonResponse({ success: false, error: message }, 409);
  if (error instanceof SyntaxError) return jsonResponse({
    success: false, error: message, code: 'model_output_invalid',
    ...(error instanceof KeywordReviewOutputError && error.usage ? { usage: error.usage } : {}),
  }, 502);
  return jsonResponse({ success: false, error: message }, 500);
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
    if (parsedBody.data.lookup === true || (parsedBody.data.lookupBudget ?? 0) > 0) {
      return jsonResponse({ success: false, error: '联网补查已暂停：当前接口不会执行网页搜索。请关闭补查后重试。' }, 400);
    }
    const provider = parsedBody.data.provider || 'deepseek';
    const model = String(parsedBody.data.model || KEYWORD_REVIEW_DEEPSEEK_MODEL).trim() || KEYWORD_REVIEW_DEEPSEEK_MODEL;
    if (provider === 'deepseek' && model !== KEYWORD_REVIEW_DEEPSEEK_MODEL) {
      return jsonResponse({ success: false, error: `关键词审核仅支持 ${KEYWORD_REVIEW_DEEPSEEK_MODEL}` }, 400);
    }
    if (provider === 'gateway' && !isApprovedModel(model, 'multimodal')) {
      return jsonResponse({ success: false, error: '请选择设置中已支持的多模态模型' }, 400);
    }
    const credentials = provider === 'deepseek'
      ? readDeepSeekKey(parsedBody.data)
      : { ok: true as const, ...resolveGatewayCreds(req, parsedBody.data, { baseUrl: getDefaultBaseUrl(), apiKey: getDefaultApiKey() }) };
    if (!credentials.ok) return credentials.response;
    const { baseUrl, apiKey } = credentials;
    if (!apiKey) return jsonResponse({ success: false, error: '未配置模型网关 API Key，请到设置里填写' }, 400);
    const replay = new Request(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(parsedBody.data) });
    return await guardSubmission(replay, 'keyword-review', credentials, async () => {
      try {
        const rules = await getKeywordReviewRules(requireWorkspaceId(), parsedBody.data.rulesVersion);
        const reviewed = await reviewKeywordRows({
          baseUrl,
          apiKey,
          model,
          provider,
          rows: parsedBody.data.rows,
          lookup: parsedBody.data.lookup === true,
          lookupBudget: parsedBody.data.lookupBudget,
          ruleEntries: rules.entries,
          rulesVersion: rules.version,
          reviewMode: parsedBody.data.reviewMode,
        });
        return jsonResponse({
          success: true,
          results: reviewed.results,
          failedIds: reviewed.failedIds,
          model,
          usage: reviewed.usage,
          lookupUsage: reviewed.lookupUsage,
          lookedUp: reviewed.lookedUp,
        });
      } catch (error) {
        return keywordReviewFailure(error);
      }
    });
  } catch (error) {
    return keywordReviewFailure(error);
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
    if (error instanceof DeepSeekApiError) return jsonResponse({ success: false, error: message, code: 'deepseek_api_error' }, error.status);
    return jsonResponse({ success: false, error: message }, 502);
  }
}
