import { EXECUTION_LIMITS } from '@shared/domain/assistant/executionPolicy';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
export function toolCallKey(name: string, args: unknown): string { return JSON.stringify([name, stable(args)]); }

/** One shared ledger for parent, nested code tools and subagents. Reserve one request to report results. */
export class AgentExecutionBudget {
  readonly limits = EXECUTION_LIMITS;
  modelRequests = 0;
  toolCalls = 0;
  subAgents = 0;
  stopReason = '';
  inputTokens = 0;
  outputTokens = 0;
  usageReports = 0;
  recordUsage(value: unknown) {
    const usage = value as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    if (!usage || !Number.isFinite(usage.prompt_tokens) || !Number.isFinite(usage.completion_tokens)) return;
    this.inputTokens += Math.max(0, usage.prompt_tokens!);
    this.outputTokens += Math.max(0, usage.completion_tokens!);
    this.usageReports++;
  }
  private repeats = new Map<string, number>();
  canContinue(): boolean { return !this.stopReason && this.modelRequests < this.limits.maxModelRequests - 1; }
  consumeModel(final = false) {
    if (this.modelRequests >= this.limits.maxModelRequests - (final ? 0 : 1)) throw new Error('已达到本轮模型请求上限，请基于已有结果结束本轮');
    this.modelRequests++;
  }
  consumeTool(name: string, args: unknown): string | undefined {
    if (this.stopReason) return this.stopReason;
    if (this.toolCalls >= this.limits.maxToolCalls) return this.stopReason = '已达到本轮工具调用上限，已停止继续执行';
    const key = toolCallKey(name, args);
    const count = (this.repeats.get(key) || 0) + 1;
    if (count > this.limits.maxRepeatedToolCalls) return `工具 ${name} 的相同参数已重复调用。请复用已有结果、调整参数或改用其他工具；不要继续相同调用`;
    if (name === 'spawn_subagent' && this.subAgents >= this.limits.maxSubAgents) return '已达到本轮子任务上限，请直接完成剩余任务';
    this.repeats.set(key, count);
    this.toolCalls++;
    if (name === 'spawn_subagent') this.subAgents++;
    return undefined;
  }
}
