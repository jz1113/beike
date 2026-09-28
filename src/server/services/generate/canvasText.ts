import { gatewayFetch } from '../../gateways/http';
import { chatCompletionBody } from '@shared/domain/models/deepseek';
import { upstreamModelId } from '@shared/domain/models/workflowModels';
import { normalizeGatewayBaseUrl } from '@shared/domain/models/gatewayUrl';
import { buildOpenAIVisionRequest, extractOpenAIResponseText, openAIResponsesUrl } from '../models/openaiResponses';

export async function generateCanvasText(input: { model: string; prompt: string; apiFormat?: 'openai-responses' }, credentials: { baseUrl: string; apiKey: string }, signal: AbortSignal) {
  if (!credentials.apiKey) throw new Error('请先配置文本模型的 API Key');
  const model = upstreamModelId(input.model);
  const content = [{ type: 'text', text: `根据以下要求生成可直接使用的文字。仅返回正文，可以使用 Markdown 排版。\n\n${input.prompt}` }];
  const response = await gatewayFetch(input.apiFormat === 'openai-responses' ? openAIResponsesUrl(credentials.baseUrl) : `${normalizeGatewayBaseUrl(credentials.baseUrl)}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${credentials.apiKey}` },
    body: input.apiFormat === 'openai-responses' ? JSON.stringify(buildOpenAIVisionRequest(model, content, 4096)) : chatCompletionBody({ model, messages: [{ role: 'user', content }], max_tokens: 4096, stream: false }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
  });
  if (!response.ok) throw new Error(`文本生成失败（HTTP ${response.status}），请检查模型配置后重试`);
  const data = await response.json();
  if (input.apiFormat === 'openai-responses') return extractOpenAIResponseText(data);
  const result = data?.choices?.[0];
  if (result?.finish_reason !== 'stop') throw new Error('模型未完整返回正文，请调整要求后重试');
  const text = result?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('模型没有返回文字');
  return text.trim();
}
