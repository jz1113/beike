import { adaptSalesScriptPlan, type SalesPlanAdaptInput } from './salesProduction';
import { listSalesPrompts, SalesPromptRequestError } from './salesPrompts';
import { adaptSalesSpokenCopy, SalesSpokenCopyRequestError } from './salesSpokenCopy';
import type { SalesSpokenCopyInput, SalesSpokenCopyPendingReview } from '@shared/contracts/salesSpokenCopy';
import { omitSourceSpeechCues, resolveSalesProductSlots } from '@shared/domain/sales/promptInputs';
import { selectedTextModel } from '@shared/domain/models/textModelRoute';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';

export interface SalesPlanRewriteCheckpoint {
  key: string;
  adapted: Awaited<ReturnType<typeof adaptSalesScriptPlan>>;
  pendingReview?: SalesSpokenCopyPendingReview;
}

/** Keep both model steps in one task; only a complete result can replace the current storyboard. */
export async function rewriteSalesScriptPlan(...args: Parameters<typeof rewriteSalesScriptPlanSteps>) {
  const signal = args[3];
  const cache = args[6];
  const clearCache = () => { if (cache) cache.current = null; };
  if (signal.aborted) clearCache();
  signal.throwIfAborted();
  signal.addEventListener('abort', clearCache, { once: true });
  try {
    return await rewriteSalesScriptPlanSteps(...args);
  } finally {
    signal.removeEventListener('abort', clearCache);
  }
}

async function rewriteSalesScriptPlanSteps(
  input: SalesPlanAdaptInput,
  speech: { sourceCopy: string; duration: number; targetCps: number; truncatedEnding?: boolean },
  selection: string,
  signal: AbortSignal,
  onProgress: (label: string) => void,
  manualSubjects?: ReadonlyMap<number, string>,
  cache?: { current: SalesPlanRewriteCheckpoint | null },
) {
  signal.throwIfAborted();
  const hasSpeech = input.voiceMode !== 'none' && input.presentationMode !== 'clean_visual';
  let promptKey = '';
  if (hasSpeech) {
    if (!Number.isFinite(speech.duration) || speech.duration <= 0 || input.beats.some((beat, index) =>
      beat.index !== index || !Number.isFinite(beat.start) || !Number.isFinite(beat.end) || beat.start < 0
      || beat.end <= beat.start || beat.end > speech.duration + 0.05
      || (index > 0 && beat.start < input.beats[index - 1].end - 0.001))) {
      throw new Error('分镜时间与视频时长不匹配或存在重叠，请先核对分镜时间后再自动改写；原分镜已保留。');
    }
    const prompts = await listSalesPrompts(signal);
    signal.throwIfAborted();
    for (const [id, title] of [['plan-adapt', '商品分镜改编'], ['spoken-copy', '口播时长适配'], ['spoken-review', '口播语义验收']]) {
      const prompt = prompts.find((item) => item.id === id);
      if (!prompt) throw new SalesPromptRequestError(`当前后台尚未提供「${title}」，请重启贝壳服务后重试；原分镜已保留。`, 503);
      if (!prompt.configured || !prompt.prompt.trim()) throw new SalesPromptRequestError(`请先在提示词管理中保存「${title}」，再按商品自动改写；原分镜已保留。`, 400, id);
    }
    promptKey = JSON.stringify(prompts.filter((prompt) => ['plan-adapt', 'spoken-copy', 'spoken-review'].includes(prompt.id))
      .map(({ id, version, prompt }) => [id, version, prompt]));
  }
  const route = getMultimodalClientOverrides(selection);
  const modelRoute = [selection.startsWith('deepseek-official:') ? selection : selectedTextModel(selection).modelId,
    route.textProtocol, route.apiFormat, route.customBaseUrl, route.allowInsecureHttp];
  const key = JSON.stringify([input, speech, selection, modelRoute, [...manualSubjects ?? []], promptKey]);
  const cached = cache?.current?.key === key ? cache.current : null;
  if (cache && !cached) cache.current = null;
  if (cached) onProgress(cached.pendingReview ? '继续验收上次已生成的口播，原分镜保持不变…' : '沿用上次已完成的商品分镜，继续改写口播…');
  const result = cached?.adapted || await adaptSalesScriptPlan(hasSpeech ? { ...input, narration: speech } : input, selection, signal);
  signal.throwIfAborted();
  const adapted = { ...result, beats: result.beats.map((beat) => manualSubjects?.has(beat.index)
    ? { ...beat, subject: manualSubjects.get(beat.index)! } : beat) };
  if (!hasSpeech || input.voiceMode === 'none') return { ...adapted, spokenCopyPromptVersion: '', spokenReviewPromptVersion: '' };
  const checkpoint: SalesPlanRewriteCheckpoint = cached || { key, adapted: result };
  if (cache) cache.current = checkpoint;
  if (!checkpoint.pendingReview && !adapted.spokenCopyPromptVersion) onProgress(`分镜改编完成，正在按当前画面选取 1—3 个商品重点，为 ${speech.duration} 秒视频写连贯${input.voiceMode === 'voiceover' ? '旁白' : '口播'}；同一镜头内可自然承接，短段可留白，字幕提炼关键词…`);
  const visual = (text: string) => resolveSalesProductSlots(omitSourceSpeechCues(text, input.voiceMode === 'speech'));
  const spokenInput: SalesSpokenCopyInput = {
    ...speech, productName: input.productName, summary: input.summary, facts: input.facts,
    buyingPoints: input.buyingPoints, unresolved: input.unresolved, cautions: input.cautions, sourceExclusions: input.sourceExclusions, voiceMode: input.voiceMode,
    beats: input.beats.map((beat) => {
      const result = adapted.beats.find((item) => item.index === beat.index);
      return { index: beat.index, start: beat.start, end: beat.end, action: visual(result?.action || beat.refAction),
        expression: visual(result?.expression ?? beat.expression ?? ''),
        transition: speech.truncatedEnding && beat.index === input.beats.length - 1 ? '' : visual(result?.transition ?? beat.transition ?? ''),
        shotIndex: beat.shotIndex, shotSize: beat.shotSize, camera: beat.camera,
        requiredView: beat.requiredView, assignedView: beat.assignedView, subject: visual(result?.subject || ''),
        purpose: beat.purpose, buyingPoint: beat.buyingPoint,
        spokenLine: result?.spokenLine || '', subtitle: result?.subtitle || '',
        sourceVoiceText: beat.sourceVoiceText, sourceLinePattern: beat.sourceLinePattern, sourceSubtitle: beat.sourceSubtitle };
    }),
  };
  let spoken: Awaited<ReturnType<typeof adaptSalesSpokenCopy>>;
  try {
    const pending = checkpoint.pendingReview;
    const draft = new Map(pending?.beats.map((beat) => [beat.index, beat]));
    if (adapted.spokenCopyPromptVersion && !pending) {
      onProgress('分镜和口播初稿已一并生成，正在核对时长与商品语义…');
      try {
        const reviewed = await adaptSalesSpokenCopy({ ...spokenInput, reviewOnly: true }, selection, signal);
        if (reviewed.beats.some((beat) => {
          const original = spokenInput.beats[beat.index];
          return !original || beat.spokenLine !== original.spokenLine || beat.subtitle !== original.subtitle;
        })) throw new Error('口播验收返回内容与分镜初稿不一致，原分镜已保留。');
        spoken = { ...reviewed, promptVersion: adapted.spokenCopyPromptVersion };
      } catch (error) {
        if (!(error instanceof SalesSpokenCopyRequestError) || !['spoken_copy_validation', 'spoken_copy_review_rejected'].includes(error.code)) throw error;
        onProgress('当前口播未通过验收，保留画面分镜，仅重写口播与字幕…');
        spoken = await adaptSalesSpokenCopy(spokenInput, selection, signal);
      }
    } else spoken = await adaptSalesSpokenCopy(pending ? { ...spokenInput, reviewOnly: true,
      beats: spokenInput.beats.map((beat) => ({ ...beat, ...draft.get(beat.index)! })) } : spokenInput, selection, signal);
    signal.throwIfAborted();
    if (pending) {
      if (spoken.beats.some((beat) => beat.spokenLine !== draft.get(beat.index)?.spokenLine || beat.subtitle !== draft.get(beat.index)?.subtitle)) {
        delete checkpoint.pendingReview;
        throw new Error('口播验收返回内容与待验收稿不一致，原分镜已保留，请重新改写。');
      }
      spoken = { ...spoken, promptVersion: pending.promptVersion };
    }
  } catch (error) {
    if (signal.aborted) {
      if (cache?.current === checkpoint) cache.current = null;
    } else if (error instanceof SalesSpokenCopyRequestError) {
      if (error.pendingReview) checkpoint.pendingReview = error.pendingReview;
      else if (['spoken_copy_review_rejected', 'spoken_copy_validation', 'spoken_copy_review_invalid'].includes(error.code)) delete checkpoint.pendingReview;
    }
    throw error;
  }
  if (cache?.current === checkpoint) cache.current = null;
  const lines = new Map(spoken.beats.map((beat) => [beat.index, beat]));
  return {
    ...adapted,
    beats: adapted.beats.map((beat) => ({ ...beat, spokenLine: lines.get(beat.index)!.spokenLine, subtitle: lines.get(beat.index)!.subtitle })),
    spokenCopyPromptVersion: spoken.promptVersion,
    spokenReviewPromptVersion: spoken.reviewPromptVersion,
  };
}
