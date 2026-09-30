import { chatCompletionBody } from '@shared/domain/models/deepseek';
import { gatewayFetch } from '../../gateways/http';
import { readJsonBody } from '../../core/validate';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { jsonResponse } from '../../core/http';
import { parseJsonBody } from '../../core/validate';
import { HeadlineDesignRequestSchema } from '@shared/contracts/generate';
import { resolveGatewayCreds } from '@shared/domain/models/gatewayCreds';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { convertToStandardJpegDataUrl } from '@server/infrastructure/media/imageConverter';
import { getDefaultApiKey, getDefaultBaseUrl } from '../../services/models/gatewayCredentials';
import {
  buildCoverDirectorPrompt,
  HeadlineContractError,
  headlineErrorHttpStatus,
  validateCoverDesign,
} from './headline-design-contract';

export async function POST(req: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await readJsonBody(req);
    } catch {
      return jsonResponse({ success: false, error: '请求数据格式异常' }, 400);
    }
    const parsedBody = parseJsonBody(rawBody, HeadlineDesignRequestSchema);
    if (!parsedBody.success) return jsonResponse({ success: false, error: parsedBody.error }, 400);
    const body = parsedBody.data;
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(90000)]);
    signal.throwIfAborted();
    const originalTitle = String(body.originalTitle || body.productTitle || '').trim();
    const coverTitle = String(body.coverTitle || body.productTitle || '').trim();
    const productName = body.productName || '';
    if (!coverTitle || !originalTitle) return jsonResponse({ success: false, error: '缺少原标题或已确认的封面标题' }, 400);
    const { baseUrl, apiKey } = resolveGatewayCreds(req, { model: body.model, customBaseUrl: body.customBaseUrl, customApiKey: body.customApiKey }, {
      baseUrl: getDefaultBaseUrl(), apiKey: getDefaultApiKey(),
    });
    if (!apiKey) return jsonResponse({ success: false, error: '未配置封面设计模型的 API Key，未提交生图任务。' }, 400);
    const images = await Promise.all(body.imageUrls.map((url) => convertToStandardJpegDataUrl(url, { maxDimension: 1280, quality: 88, signal })));
    signal.throwIfAborted();
    if (images.some((url) => !url)) return jsonResponse({ success: false, error: '商品图片读取失败，未调用设计或生图模型' }, 400);
    const content = [
      { type: 'text', text: buildCoverDirectorPrompt(
        originalTitle,
        coverTitle,
        body.aspectRatio === '1:1' ? '1:1' : '3:4',
        String(body.reservedArtDirection?.description || '').trim() || undefined,
        String(body.reservedArtDirection?.id || '').trim() || undefined,
        productName,
      ) },
      ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
    ];
    const model = String(body.model || 'gemini-3.7-flash').trim() || 'gemini-3.7-flash';
    const response = await gatewayFetch(`${normalizeGatewayBaseUrl(baseUrl)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: chatCompletionBody({ model, messages: [{ role: 'user', content }], temperature: 0.65, response_format: { type: 'json_object' } }),
      signal,
    });
    if (!response.ok) throw new Error(`设计模型 ${model} 返回 HTTP ${response.status}`);
    const data = await response.json();
    signal.throwIfAborted();
    const raw = data?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) throw new HeadlineContractError(`设计模型 ${model} 没有返回有效内容`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    } catch {
      throw new SyntaxError('设计模型没有返回合法 JSON');
    }
    return jsonResponse({
      success: true,
      data: validateCoverDesign(parsed, coverTitle, String(body.reservedArtDirection?.id || '').trim() || undefined, productName),
      model,
      promptVersion: 'integrated-cover-v4',
    });
  } catch (error) {
    return jsonResponse({ success: false, error: formatUserError(error, '封面设计方案生成失败') }, headlineErrorHttpStatus(error));
  }
}
