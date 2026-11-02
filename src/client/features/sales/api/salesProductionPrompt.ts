import { listSalesPrompts } from './salesPrompts';

interface AdaptationProvenance {
  adaptedBeats: readonly unknown[];
  adaptedSourceKey: string;
  adaptedPromptVersion: string;
}

/** Manual edits need no model provenance; auto-adapted drafts keep their original prompt version. */
export async function ensureSalesAdaptationPromptCurrent(plan: AdaptationProvenance, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!plan.adaptedBeats.length || (!plan.adaptedSourceKey && !plan.adaptedPromptVersion)) return;
  if (!plan.adaptedPromptVersion) {
    throw new Error('当前自动改编未记录提示词版本，请重新适配商品后生成；原分镜和手工修改已保留。');
  }
  const current = (await listSalesPrompts(signal)).find((prompt) => prompt.id === 'plan-adapt');
  signal.throwIfAborted();
  if (!current) throw new Error('未能读取当前商品分镜改编提示词，已停止生成，请刷新后重试。');
  if (current.version !== plan.adaptedPromptVersion) {
    throw new Error('商品分镜改编提示词已更新，请重新适配商品后生成；原分镜和手工修改已保留。');
  }
}
