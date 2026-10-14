import type { ApprovedModel } from './model-catalog/defs';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_ROUTE_PREFIX = 'deepseek-official:';
export const DEEPSEEK_MODELS = [
  { id: 'deepseek-flash', name: 'DeepSeek Flash', vision: true },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', vision: false },
] as const;
export const deepSeekRouteId = (id: string) => `${DEEPSEEK_ROUTE_PREFIX}${id}`;
export const isDeepSeekRoute = (id: string) => id.startsWith(DEEPSEEK_ROUTE_PREFIX);
export const deepSeekModelId = (id: string) => isDeepSeekRoute(id) ? id.slice(DEEPSEEK_ROUTE_PREFIX.length) : id;
export const deepSeekModel = (id: string) => DEEPSEEK_MODELS.find(model => model.id === deepSeekModelId(id));
export function approvedDeepSeekModel(route: string): ApprovedModel | undefined {
  const model = isDeepSeekRoute(route) ? deepSeekModel(route) : undefined;
  return model ? { id: route, name: model.name, shortName: model.name, vendor: 'deepseek',
    capability: 'multimodal', adapter: 'chat-completions', isThinking: true,
    docs: 'https://api-docs.deepseek.com/api/create-chat-completion/' } : undefined;
}
/** Keep channel identity in the app; strip it only at the upstream boundary. */
export function chatCompletionBody(payload: Record<string, unknown>): string {
  const route = typeof payload.model === 'string' ? payload.model : '';
  if (!isDeepSeekRoute(route)) return JSON.stringify(payload);
  const model = deepSeekModel(route);
  if (!model) throw new Error('此 DeepSeek 官方模型尚未适配，请选择 Flash 或 V4 Pro');
  const messages = payload.messages as Array<{ role?: string; content?: unknown; tool_calls?: unknown[] }> | undefined;
  if (!model.vision && messages?.some(message => Array.isArray(message.content)
    && message.content.some(part => part?.type === 'image_url'))) {
    throw new Error('DeepSeek V4 Pro 仅支持文本，请选择 DeepSeek Flash 分析图片');
  }
  const effort = payload.reasoning_effort;
  const mapped = effort === 'low' ? 'low' : effort === 'xhigh' || effort === 'max' ? 'max' : 'high';
  const wire: Record<string, unknown> = { ...payload, ...(messages ? { messages: messages.map(message => message.role === 'assistant' && message.tool_calls?.length && message.content == null ? { ...message, content: '' } : message) } : {}) };
  // V4 thinking mode rejects tool_choice, including "auto".
  if (effort && effort !== 'none') delete wire.tool_choice;
  return JSON.stringify({ ...wire, model: model.id,
    thinking: { type: effort && effort !== 'none' ? 'enabled' : 'disabled' },
    ...(effort ? { reasoning_effort: effort === 'none' ? 'none' : mapped } : {}),
  });
}
