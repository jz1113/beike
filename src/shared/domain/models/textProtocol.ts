import capabilities from './textModelCapabilities.json';

export type TextProtocol = 'auto' | 'openai' | 'gemini' | 'anthropic';
export type ResolvedTextProtocol = Exclude<TextProtocol, 'auto'>;
export interface TextModelCapability {
  protocol: ResolvedTextProtocol;
  thinking: 'level' | 'budget' | 'adaptive' | 'enabled';
  levels: readonly string[];
  aliases?: readonly string[];
  budgets?: Record<string, number>;
}
const models = capabilities.models as Record<string, TextModelCapability>;
export function parseTextProtocol(value: unknown): TextProtocol | undefined {
  return value === 'auto' || value === 'openai' || value === 'gemini' || value === 'anthropic' ? value : undefined;
}
export function textModelCapability(modelId: string): TextModelCapability | undefined {
  const id = modelId.trim().toLowerCase();
  return models[id] || Object.values(models).find(model => model.aliases?.includes(id));
}
/** Legacy native templates override inference; Chat Completions was the old default, not explicit consent. */
export function configuredTextProtocol(model: { textProtocol?: unknown; apiTemplate?: string }): TextProtocol | undefined {
  return parseTextProtocol(model.textProtocol) || parseTextProtocol(model.apiTemplate);
}
export function resolveTextProtocol(modelId: string, preference?: TextProtocol): ResolvedTextProtocol {
  if (preference && preference !== 'auto') return preference;
  const id = modelId.trim().toLowerCase();
  const known = textModelCapability(id);
  if (known) return known.protocol;
  if (id.startsWith('gemini-')) return 'gemini';
  if (id.startsWith('claude-')) return 'anthropic';
  return 'openai';
}
