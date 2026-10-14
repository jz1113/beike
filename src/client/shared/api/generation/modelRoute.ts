import { isDeepSeekRoute, deepSeekModel } from '@shared/domain/models/deepseek';
import { getMultimodalClientOverrides } from '../gatewayClient';
const endpoints = new Set(['/api/assistant/turn/start', '/api/generate/analyze', '/api/generate/copywriting',
  '/api/catalog/assets/deconstruct', '/api/catalog/styles/extract', '/api/generate/headline-design', '/api/generate/headline-title']);
export function withModelRoute(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (typeof input !== 'string' || !endpoints.has(input.split('?')[0]) || init?.method?.toUpperCase() !== 'POST' || typeof init.body !== 'string') return init;
  let body;
  try { body = JSON.parse(init.body); } catch { return init; }
  if (!body || typeof body.model !== 'string') return init;

  if (isDeepSeekRoute(body.model)) {
    if (input.startsWith('/api/assistant/') && !deepSeekModel(body.model)?.vision && Array.isArray(body.messages)
      && body.messages.some((message: { attachments?: Array<{ type?: string }> }) => message.attachments?.some(attachment => attachment.type === 'image' || attachment.type === 'video'))) {
      throw new Error('DeepSeek V4 Pro 仅支持文本，请切换到 DeepSeek Flash 处理图片或视频附件');
    }
    const credentials = getMultimodalClientOverrides(body.model);
    return { ...init, body: JSON.stringify({ ...body, ...credentials, apiFormat: undefined, allowInsecureHttp: undefined, fallbackModels: [], fallbackOrder: [] }) };
  }

  const credentials = getMultimodalClientOverrides(body.model);
  if (credentials.customBaseUrl || credentials.customApiKey) {
    return { ...init, body: JSON.stringify({ ...body, ...credentials, apiFormat: undefined, allowInsecureHttp: undefined, fallbackModels: [], fallbackOrder: [] }) };
  }

  return init;
}
