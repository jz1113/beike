import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';

type VisionPart = { type: string; text?: string; image_url?: { url: string } };
type ResponsesInputPart = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' };

export function openAIResponsesUrl(baseUrl: string): string {
  return `${normalizeGatewayBaseUrl(baseUrl)}/v1/responses`;
}

/** Map Chat Completions vision parts to the official Responses input schema. */
export function buildOpenAIVisionRequest(model: string, content: VisionPart[], maxOutputTokens: number, jsonObject = false) {
  return {
    model,
    input: [{ role: 'user', content: content.flatMap((part): ResponsesInputPart[] => {
      if (part.type === 'text' && part.text) return [{ type: 'input_text', text: part.text }];
      if (part.type === 'image_url' && part.image_url?.url) return [{ type: 'input_image', image_url: part.image_url.url, detail: 'auto' }];
      return [];
    }) }],
    max_output_tokens: maxOutputTokens,
    store: false,
    ...(jsonObject ? { text: { format: { type: 'json_object' } } } : {}),
  };
}

export function extractOpenAIResponseText(data: any): string {
  if (data?.status === 'failed' || data?.error) throw new Error(data?.error?.message || 'OpenAI 返回错误响应');
  if (data?.status === 'incomplete') throw new Error('OpenAI 输出不完整，请增加输出 token 上限');
  const nested = Array.isArray(data?.output) ? data.output.flatMap((item: any) =>
    Array.isArray(item?.content) ? item.content.filter((part: any) => part?.type === 'output_text' && typeof part.text === 'string').map((part: any) => part.text) : []) : [];
  const text = nested.join('') || (typeof data?.output_text === 'string' ? data.output_text : '');
  if (!text.trim()) throw new Error('OpenAI 未返回可用正文');
  return text.trim();
}
