import { isDeepSeekRoute, deepSeekModel } from '@shared/domain/models/deepseek';
import { selectedTextModel, selectedTextProtocol } from '@shared/domain/models/textModelRoute';
import { parseTextProtocol } from '@shared/domain/models/textProtocol';
import { getMultimodalClientOverrides } from '../gatewayClient';
const endpoints = new Set(['/api/system/config', '/api/assistant/turn/start', '/api/generate/analyze', '/api/generate/copywriting',
  '/api/catalog/assets/deconstruct', '/api/catalog/styles/extract',
  '/api/generate/headline-design', '/api/generate/headline-title', '/api/generate/headline-deconstruct',
  '/api/generate/canvas-text', '/api/generate/keyword-review', '/api/generate/ppt-outline',
  '/api/generate/ppt-detail', '/api/generate/ppt-narration', '/api/generate/video-sales/analyze',
  '/api/generate/video-sales/script', '/api/generate/video-sales/select-images', '/api/generate/video-sales/finalize-prompts', '/api/generate/video-sales/validate-assets']);
export function withModelRoute(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (typeof input !== 'string' || !endpoints.has(input.split('?')[0]) || init?.method?.toUpperCase() !== 'POST' || typeof init.body !== 'string') return init;
  let body;
  try { body = JSON.parse(init.body); } catch { return init; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return init;
  if (input.split('?')[0] === '/api/system/config') {
    if (body.type && body.type !== 'ai') return init;
    const preference = parseTextProtocol(body.textProtocol);
    const selection = typeof body.model === 'string' ? body.model : '';
    return { ...init, body: JSON.stringify({ ...body,
      ...(selection ? { model: selectedTextModel(selection).modelId } : {}),
      textProtocol: selection ? selectedTextProtocol(selection, preference) : preference || 'auto',
    }) };
  }
  if (typeof body.model !== 'string') return init;
  const selected = body.model;
  const model = selectedTextModel(selected).modelId;
  if (isDeepSeekRoute(selected) && input.startsWith('/api/assistant/') && !deepSeekModel(selected)?.vision && Array.isArray(body.messages)
    && body.messages.some((message: { attachments?: Array<{ type?: string }> }) => message.attachments?.some(attachment => attachment.type === 'image' || attachment.type === 'video'))) {
    throw new Error('DeepSeek V4 Pro 仅支持文本，请切换到 DeepSeek Flash 处理图片或视频附件');
  }
  // A caller that already resolved credentials must also send its selected protocol; never replace explicit wire options.
  const headers = new Headers(init.headers);
  const hasCredentials = body.customBaseUrl || body.customApiKey || headers.get('x-custom-base-url') || headers.get('x-custom-api-key');
  const credentials = hasCredentials ? {} : getMultimodalClientOverrides(selected);
  const textProtocol = selectedTextProtocol(selected, parseTextProtocol(body.textProtocol)
    || (body.apiFormat === 'openai-responses' ? 'openai' : undefined));
  return { ...init, body: JSON.stringify({ ...credentials, ...body,
    model: isDeepSeekRoute(selected) ? selected : model, textProtocol,
    ...(credentials.customBaseUrl || credentials.customApiKey || hasCredentials ? { fallbackModels: [], fallbackOrder: [] } : {}),
  }) };
}
