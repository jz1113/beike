import type { SalesCollectionState } from './salesCollectionDraft';
import { eligibleSalesImages, type SalesSceneCandidate, type SalesScriptDomain } from '@shared/domain/sales';
import { salesSummaryMatches, salesSummarySource } from './salesSummary';
import { salesPersonaBindingKey } from './salesPersonaBinding';
import { salesAdaptationSceneKey, salesAdaptationScriptKey } from './salesAdaptationBindings';
import { salesSpokenCopyTimingMatches, type SalesSpokenCopyContext } from './salesSpokenCopySource';

const staleProductMessage = '商品资料已更新，旧卖点与分镜尚未核对；请返回分镜，按当前资料重新自动适配商品（可跳过卖点提炼），或重新提炼卖点后核对台词。';

export function salesProductionSummaryIsStale(state: SalesCollectionState): boolean {
  return Boolean(state.productSummary && !salesSummaryMatches(state.productSummary.inputKey, salesSummarySource(state)));
}

/** Storyboard adaptation still uses the full product facts and selected references. */
function salesPlanProductInput(state: SalesCollectionState) {
  const textImages = state.imageCatalog.filter((image) => !image.unavailable && state.ocrImageUrls.includes(image.url)).flatMap((image) => {
    const entry = state.ocrImages.find((item) => item.imageUrl === image.url);
    return entry?.editedText.trim() ? [{ index: image.index, url: image.url, text: entry.editedText.trim() }] : [];
  });
  return {
    productName: state.productName.trim(), brand: state.brand.trim(),
    facts: [state.sellingPoints.trim(), ...Object.entries(state.props).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}：${value}`)].filter(Boolean).join('\n'),
    referenceImages: eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata).map(({ index, url, view, role }) => ({ index, url, view, role })),
    textImages,
  };
}

/** Only source attributes and current OCR edits can establish product facts. */
export function salesPlanSource(state: SalesCollectionState): { facts: string; error: string } {
  const source = salesPlanProductInput(state);
  const queue = state.imageCatalog.filter((image) => state.ocrImageUrls.includes(image.url));
  const incomplete = queue.some((image) => {
    const entry = state.ocrImages.find((item) => item.imageUrl === image.url);
    return image.unavailable || !entry?.result || entry.error;
  });
  const facts = [source.facts, ...source.textImages.map((image) => image.text)].filter(Boolean).join('\n');
  const error = incomplete ? '请先完成当前图片队列的文字识别，再优化分镜。'
    : facts.length > 20_000 ? '分镜改编资料超过 20000 字，请精简商品资料或减少文字图片，避免遗漏重要信息。' : '';
  return { facts, error };
}


/** Record the reviewed facts, bound identities and script content used by a successful adaptation. */
export function salesPlanAdaptationSourceKey(state: SalesCollectionState, script?: SalesScriptDomain, scene?: SalesSceneCandidate | null): string {
  const sourceKey = JSON.stringify({ rulesVersion: 2, input: salesPlanProductInput(state) });
  const saved = state.productSummary;
  const productKey = saved && !salesProductionSummaryIsStale(state)
    ? JSON.stringify([sourceKey, saved.result, saved.editedCopy ?? saved.result.copy]) : sourceKey;
  return JSON.stringify([state.selectedScriptId, state.collectedProductUrl, state.category, productKey,
    salesPersonaBindingKey(state.productionPlan), salesAdaptationSceneKey(state.productionPlan, scene), salesAdaptationScriptKey(script)]);
}

function productSourceFromKey(key: string): string {
  try {
    const fields: unknown = JSON.parse(key);
    return Array.isArray(fields) && [4, 5, 7].includes(fields.length) && fields.every((field) => typeof field === 'string')
      ? JSON.stringify(fields.slice(0, 4)) : '';
  } catch { return ''; }
}

export function salesProductionSourceError(state: SalesCollectionState, checkPersona = true, script?: SalesScriptDomain, scene?: SalesSceneCandidate | null, spokenCopyContext?: SalesSpokenCopyContext): string {
  const plan = state.productionPlan;
  if (plan.adaptedBeats.length && plan.adaptedSourceKey) {
    let previous: unknown;
    try { previous = JSON.parse(plan.adaptedSourceKey); } catch { previous = null; }
    if (checkPersona && (!Array.isArray(previous) || typeof previous[4] !== 'string')) {
      return '当前自动改编尚未记录人物来源，请重新自动适配商品后生成；原分镜内容已保留。';
    }
    if (checkPersona && Array.isArray(previous) && previous[4] !== salesPersonaBindingKey(plan)) {
      return '出镜人物已变更，旧分镜可能仍含原人物描述；请重新自动适配商品后生成，原分镜内容已保留。';
    }
    if (script) {
      if (!Array.isArray(previous) || typeof previous[5] !== 'string' || !previous[6]) {
        return '当前自动改编尚未记录场景或脚本内容来源，请重新自动适配商品后生成；原分镜内容已保留。';
      }
      if (previous[5] !== salesAdaptationSceneKey(plan, scene)) {
        return '拍摄场景已变更，旧分镜可能仍含原场景动作；请重新自动适配商品后生成，原分镜内容已保留。';
      }
      if (previous[6] !== salesAdaptationScriptKey(script)) {
        return '参考脚本内容已更新，旧分镜可能仍含原动作或表情；请重新自动适配商品后生成，原分镜内容已保留。';
      }
    }
    const previousProduct = productSourceFromKey(plan.adaptedSourceKey);
    if (!previousProduct || previousProduct !== productSourceFromKey(salesPlanAdaptationSourceKey(state, script, scene))) return staleProductMessage;
  }
  const sourceBeats = script?.shots.flatMap((shot) => shot.beats) || [];
  for (const beat of plan.adaptedBeats) {
    const source = sourceBeats[beat.index];
    if (beat.action.trim() && source && ((source.expression && beat.expression === undefined) || (source.transition && beat.transition === undefined))) {
      return `动作段 ${beat.index + 1} 的旧改编未独立保留表情或衔接，请重新自动适配商品或补充对应内容后生成；原分镜已保留。`;
    }
  }
  if (script && spokenCopyContext && spokenCopyContext.voiceMode !== 'none' && plan.spokenCopySourceKey
    && !salesSpokenCopyTimingMatches(plan.spokenCopySourceKey, script, spokenCopyContext.voiceMode, spokenCopyContext.durationSec)) {
    return '介绍方式或视频时长已更新，请重新按商品自动改写以适配口播时长；原分镜和手工修改已保留。';
  }
  // Stale summaries are already excluded from generation. Only content derived
  // from an automatic adaptation needs the source checks above; script/manual
  // production must not require an otherwise unused selling-point extraction.
  return '';
}
