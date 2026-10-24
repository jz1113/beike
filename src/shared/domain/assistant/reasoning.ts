import { selectedTextModel, selectedTextProtocol } from '../models/textModelRoute';
import { textModelCapability, type TextProtocol } from '../models/textProtocol';
import { deepSeekModel, isDeepSeekRoute } from '../models/deepseek';
/** UI levels follow the verified model and selected protocol. See docs/reasoning.md. */
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
/** auto is accepted only for legacy preferences and unsupported-model defaults. */
export type ReasoningEffort = typeof REASONING_EFFORTS[number] | 'auto';
export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  auto: '默认',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最高',
};
interface ReasoningCapability {
  levels: readonly ReasoningEffort[];
  description: string;
  unavailableLabel?: string;
  maxEffort?: boolean;
  preserveReasoning?: boolean;
}
const gptMaxModels = new Set([
  'gpt-6-luna', 'gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.6',
  'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra',
]);
const fourTierModels = new Set(['gpt-5.4-mini', 'grok-4.6', 'grok-4.7']);
const deepseekModels = new Set(['deepseek-v4-flash', 'deepseek-v4.1-flash']);
const fullMax: ReasoningCapability = { levels: REASONING_EFFORTS, description: '支持低、中、高、极高、最高五档思考强度。' };
const fullFour: ReasoningCapability = { levels: ['low', 'medium', 'high', 'xhigh'], description: '支持低、中、高、极高四档思考强度。' };
const max: ReasoningCapability = { levels: ['low', 'high', 'xhigh', 'max'], description: '支持低、高、极高、最高；极高与最高使用模型的最大推理强度。', maxEffort: true, preserveReasoning: true };
export function reasoningCapability(model: string, protocol?: TextProtocol): ReasoningCapability {
  const id = selectedTextModel(model).modelId.toLowerCase();
  const effectiveProtocol = selectedTextProtocol(model, protocol);
  const native = textModelCapability(id);
  if (native && native.protocol === effectiveProtocol) return {
    levels: native.levels.filter((level): level is typeof REASONING_EFFORTS[number] => (REASONING_EFFORTS as readonly string[]).includes(level)),
    description: `当前型号支持${native.levels.filter(level => (REASONING_EFFORTS as readonly string[]).includes(level)).map(level => REASONING_EFFORT_LABELS[level as ReasoningEffort]).join('、')}档${native.thinking === 'adaptive' ? '自适应思考投入' : '思考强度'}。`,
  };
  if (effectiveProtocol !== 'openai' || native) return { levels: [], unavailableLabel: '待确认', description: '尚未确认此模型在当前协议下的思考参数，使用模型默认设置。' };
  if (id === 'smart-reasoning' || id === 'smart') {
    return { levels: ['low', 'medium', 'high'], description: '支持低、中、高三档；智能匹配将自动选配合适的推理预算。' };
  }
  if (gptMaxModels.has(id)) return fullMax;
  if (fourTierModels.has(id)) return fullFour;
  if (id === 'qwen3.8-max') return { levels: ['low', 'medium', 'xhigh'], description: '支持低、中、极高三档；官方将高映射为极高。', preserveReasoning: true };
  if (id === 'kimi-k3' || deepseekModels.has(id) || (isDeepSeekRoute(model) && deepSeekModel(model))) return max;
  if (id.startsWith('claude-')) return { levels: [], unavailableLabel: '待确认', description: '此模型在当前协议下尚未确认支持强度调节，使用模型默认设置。' };
  return { levels: [], unavailableLabel: '默认', description: '暂未确认此模型的强度参数，使用模型默认设置。' };
}
export function supportsReasoningEffort(model: string): boolean {
  return reasoningCapability(model).levels.length > 0;
}
export function normalizeReasoningEffort(model: string, value: unknown, protocol?: TextProtocol): ReasoningEffort {
  const { levels } = reasoningCapability(model, protocol);
  if (!levels.length) return 'auto';
  if (!(REASONING_EFFORTS as readonly unknown[]).includes(value)) value = 'medium';
  if (levels.includes(value as ReasoningEffort)) return value as ReasoningEffort;
  const nonMax = levels.filter((level): level is ReasoningEffort => level !== 'max');
  const pool = nonMax.length ? nonMax : levels;
  // Switching models retains the closest supported strength without silently escalating xhigh into max.
  return pool.find(level => (REASONING_EFFORTS as readonly ReasoningEffort[]).indexOf(level) >= (REASONING_EFFORTS as readonly ReasoningEffort[]).indexOf(value as ReasoningEffort)) || pool[pool.length - 1];
}
export function reasoningRequestOptions(model: string, effort?: ReasoningEffort, protocol?: TextProtocol) {
  const value = normalizeReasoningEffort(model, effort, protocol);
  if (value === 'auto') return {};
  const native = textModelCapability(selectedTextModel(model).modelId);
  if (native?.protocol === selectedTextProtocol(model, protocol)) {
    if (native.thinking === 'level') return { thinkingConfig: { thinkingLevel: value } };
    if (native.thinking === 'adaptive') return { thinking: { type: 'adaptive' as const }, output_config: { effort: value } };
    if (native.thinking === 'budget' && native.budgets?.[value]) return native.protocol === 'gemini'
      ? { thinkingConfig: { thinkingBudget: native.budgets[value] } }
      : { thinking: { type: 'enabled' as const, budget_tokens: native.budgets[value] } };
    if (native.thinking === 'enabled') return { thinking: { type: 'enabled' as const } };
    return {};
  }
  return { reasoning_effort: (value === 'xhigh' || value === 'max') && reasoningCapability(model, protocol).maxEffort ? 'max' : value,
    ...(deepseekModels.has(selectedTextModel(model).modelId.toLowerCase()) ? { thinking: { type: 'enabled' as const } } : {}),
  };
}
/** Reasoning models should use vendor sampling defaults, not the legacy chat temperature. */
export function reasoningSamplingOptions(model: string, temperature: number): { temperature?: number } {
  return supportsReasoningEffort(model) ? {} : { temperature };
}
