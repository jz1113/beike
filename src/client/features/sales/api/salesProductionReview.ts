import type { BeatProductImageBinding, SalesBeatVoiceMode, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesCollectionState } from '../model/salesCollectionDraft';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { salesPlanSource } from '../model/salesPlanSource';
import { salesSpokenReviewInput, salesSpokenReviewSourceKey } from '../model/salesSpokenReview';
import { adaptSalesSpokenCopy } from './salesSpokenCopy';
import { listSalesPrompts } from './salesPrompts';

type ReviewReceipt = Pick<SalesProductionPlanState, 'spokenReviewPromptVersion' | 'spokenReviewSourceKey'>;

/** A changed manual draft gets reviewed without rewriting its words or discarding existing media. */
export async function reviewSalesProductionSpeech(
  state: SalesCollectionState, script: SalesScriptDomain, bindings: readonly BeatProductImageBinding[],
  voiceMode: SalesBeatVoiceMode, durationSec: number, selection: string,
  signal: AbortSignal, onProgress: (text: string) => void,
  truncatedEnding = false,
): Promise<ReviewReceipt> {
  signal.throwIfAborted();
  const empty = { spokenReviewPromptVersion: '', spokenReviewSourceKey: '' };
  const input = salesSpokenReviewInput(state, script, bindings, voiceMode, durationSec, truncatedEnding);
  if (!input) return empty;
  const sourceError = salesPlanSource(state).error;
  if (sourceError) throw new Error(sourceError);
  const sourceKey = salesSpokenReviewSourceKey(input);
  const prompt = (await listSalesPrompts(signal)).find((item) => item.id === 'spoken-review');
  signal.throwIfAborted();
  if (!prompt?.configured || !prompt.prompt.trim()) throw new Error('请先在提示词管理中保存「口播语义验收」；原分镜和手工台词已保留。');
  if (state.productionPlan.spokenReviewSourceKey === sourceKey && state.productionPlan.spokenReviewPromptVersion === prompt.version) {
    return { spokenReviewPromptVersion: prompt.version, spokenReviewSourceKey: sourceKey };
  }
  if (!selection) throw new Error('请先选择改写模型，用于验收当前口播；手工台词保持原文。');
  onProgress('正在验收当前口播的完整句意、事实和画面对应，保留手工原文…');
  const reviewed = await adaptSalesSpokenCopy(input, selection, signal);
  signal.throwIfAborted();
  if (reviewed.reviewPromptVersion !== prompt.version) throw new Error('口播语义验收规则已更新，请重新核对后生成；原分镜已保留。');
  if (reviewed.beats.some((beat) => {
    const original = input.beats.find((item) => item.index === beat.index);
    return !original || original.spokenLine !== beat.spokenLine || original.subtitle !== beat.subtitle;
  })) throw new Error('口播验收返回内容与原稿不一致，已停止生成；手工台词已保留。');
  return { spokenReviewPromptVersion: reviewed.reviewPromptVersion, spokenReviewSourceKey: sourceKey };
}
