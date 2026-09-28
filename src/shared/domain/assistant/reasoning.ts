import { deepSeekModel, isDeepSeekRoute } from '../models/deepseek';
/** UI levels are mapped to each vendor's Chat Completions contract. See docs/reasoning.md. */
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const;
/** auto is accepted only for legacy preferences and unsupported-model defaults. */
export type ReasoningEffort = typeof REASONING_EFFORTS[number] | 'auto';
interface ReasoningCapability {
  levels: readonly ReasoningEffort[];
  description: string;
  unavailableLabel?: string;
  maxEffort?: boolean;
  preserveReasoning?: boolean;
}
const gptModels = new Set([
  'gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-5.6', 'gpt-5.6-luna',
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.4-mini',
]);
const geminiModels = new Set(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.1-pro-preview']);
const deepseekModels = new Set(['deepseek-v4-flash', 'deepseek-v4.1-flash']);
const full: ReasoningCapability = { levels: REASONING_EFFORTS, description: '支持低、中、高、极高四档思考强度。' };
const max: ReasoningCapability = { levels: ['low', 'high', 'xhigh'], description: '支持低、高、极高三档；极高使用模型的最大推理强度。', maxEffort: true, preserveReasoning: true };
export function reasoningCapability(model: string): ReasoningCapability {
  const id = model.toLowerCase();
  if (gptModels.has(id) || ['grok-4.6', 'grok-4.7'].includes(id)) return full;
  if (geminiModels.has(id)) return { levels: ['low', 'medium', 'high'], description: '支持低、中、高三档；高为此模型的最高强度。' };
  if (id === 'qwen3.8-max') return { levels: ['low', 'medium', 'xhigh'], description: '支持低、中、极高三档；官方将高映射为极高。', preserveReasoning: true };
  if (id === 'kimi-k3' || deepseekModels.has(id) || (isDeepSeekRoute(id) && deepSeekModel(id))) return max;
  if (id.startsWith('claude-')) return { levels: [], unavailableLabel: '未适配', description: 'Claude 原生接口支持思考配置，当前兼容通道尚未确认支持强度调节，暂由模型自行决定。' };
  return { levels: [], unavailableLabel: '默认', description: '暂未确认此模型的强度参数，使用模型默认设置。' };
}
export function supportsReasoningEffort(model: string): boolean {
  return reasoningCapability(model).levels.length > 0;
}
export function normalizeReasoningEffort(model: string, value: unknown): ReasoningEffort {
  const { levels } = reasoningCapability(model);
  if (!levels.length) return 'auto';
  if (!(REASONING_EFFORTS as readonly unknown[]).includes(value)) value = 'medium';
  if (levels.includes(value as ReasoningEffort)) return value as ReasoningEffort;
  // Switching models retains the closest supported strength, with the displayed value matching the wire.
  return levels.find(level => (REASONING_EFFORTS as readonly ReasoningEffort[]).indexOf(level) >= (REASONING_EFFORTS as readonly ReasoningEffort[]).indexOf(value as ReasoningEffort)) || levels[levels.length - 1];
}
export function reasoningRequestOptions(model: string, effort?: ReasoningEffort): { reasoning_effort?: string; thinking?: { type: 'enabled' } } {
  const value = normalizeReasoningEffort(model, effort);
  if (value === 'auto') return {};
  return { reasoning_effort: value === 'xhigh' && reasoningCapability(model).maxEffort ? 'max' : value,
    ...(deepseekModels.has(model.toLowerCase()) ? { thinking: { type: 'enabled' as const } } : {}),
  };
}
/** Reasoning models should use vendor sampling defaults, not the legacy chat temperature. */
export function reasoningSamplingOptions(model: string, temperature: number): { temperature?: number } {
  return supportsReasoningEffort(model) || model.startsWith('claude-') ? {} : { temperature };
}
