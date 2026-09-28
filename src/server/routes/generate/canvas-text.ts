import { canvasTextRequest } from '@shared/contracts/canvasText';
import { resolveGatewayCreds } from '@shared/domain/models/gatewayCreds';
import { jsonResponse } from '../../core/http';
import { readJsonBody, safeErrorMessage } from '../../core/validate';
import { generateCanvasText } from '../../services/generate/canvasText';
import { getDefaultBaseUrl, getDefaultApiKey } from '../../services/models/gatewayCredentials';

export async function POST(req: Request) {
  try {
    const parsed = canvasTextRequest.safeParse(await readJsonBody(req));
    if (!parsed.success) return jsonResponse({ success: false, error: '请选择模型并填写生成要求（最多 20000 字）' }, 400);
    const body = parsed.data;
    const credentials = resolveGatewayCreds(req, body, { baseUrl: getDefaultBaseUrl(), apiKey: getDefaultApiKey() });
    const text = await generateCanvasText(body, credentials, req.signal);
    return jsonResponse({ success: true, text });
  } catch (error) {
    return jsonResponse({ success: false, error: safeErrorMessage(error, '文本生成失败，请重试') }, 502);
  }
}
