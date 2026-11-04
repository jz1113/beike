import { useCallback, useEffect, useRef } from 'react';
import {
  describeBoundImageLabel, type AssembledSalesPrompt, type BeatProductImageBinding,
  type SalesAdaptedBeat, type SalesPersonaCandidate, type SalesSceneCandidate,
} from '@shared/domain/sales';
import type { SalesPlanAdaptInput } from '../api/salesProduction';
import { rewriteSalesScriptPlan, type SalesPlanRewriteCheckpoint } from '../api/salesPlanRewrite';
import type { StoredSalesScript } from '../api/salesScripts';
import type { SalesCollectionState } from '../model/salesCollectionDraft';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { salesPersonaDescription } from '../model/salesPersonaBinding';
import { salesPlanAdaptationSourceKey, salesPlanSource, salesProductionSummaryIsStale } from '../model/salesPlanSource';
import { mergeSalesAdaptedWindow, salesManualPerformanceEdits } from '../model/salesPerformanceEdits';
import { salesSpokenCopySourceKey } from '../model/salesSpokenCopySource';
import { salesSpokenReviewInput, salesSpokenReviewSourceKey } from '../model/salesSpokenReview';
import { resolveSalesVideoSettings } from '../model/salesVideoSettings';
import type { useSalesProductionTask } from './useSalesProductionTask';

type ProductionTask = ReturnType<typeof useSalesProductionTask>;
interface PlanAdaptContext {
  activeScript: StoredSalesScript | null;
  assembled: AssembledSalesPrompt | null;
  beatBindings: readonly BeatProductImageBinding[];
  durationError?: string;
  truncatedEnding?: boolean;
  state: SalesCollectionState;
  selectedPersona: SalesPersonaCandidate | null;
  selectedScene: SalesSceneCandidate | null;
  patchPlan: (patch: Partial<SalesProductionPlanState>) => void;
  runTask: ProductionTask['runTask'];
  setError: ProductionTask['setError'];
}

/** Adapt the current product bindings and narration as one cancellable task. */
export function useSalesPlanAdapt({
  activeScript, assembled, beatBindings, durationError, truncatedEnding, state, selectedPersona, selectedScene,
  patchPlan, runTask, setError,
}: PlanAdaptContext) {
  const rewriteCache = useRef<SalesPlanRewriteCheckpoint | null>(null);
  // A manual edit or context change invalidates even an unpublished retry draft.
  useEffect(() => { rewriteCache.current = null; }, [state]);
  return useCallback(async (modelSelection: string): Promise<boolean> => {
    if (!activeScript || !assembled) return false;
    if (durationError) { setError(durationError); return false; }
    if (activeScript.status !== 'verified') { setError('当前参考脚本尚未确认入库，请先到脚本库复核并确认后再制作'); return false; }
    if ((state.productionPlan.sceneId || state.productionPlan.customSceneImageUrl) && !(state.productionPlan.customSceneImageUrl.trim() || selectedScene?.coverUrl.trim())) { setError('所选场景的参考图不可用，请重新选择场景或上传场景主图后改编；原分镜已保留。'); return false; }
    const summaryRes = salesProductionSummaryIsStale(state) ? undefined : state.productSummary?.result;
    const buyingPoints = summaryRes?.points.map((p) => [p.benefit.trim(), p.feature.trim(), p.expression.trim()].filter(Boolean).join('；')).filter(Boolean) || [];
    const { facts, error: sourceError } = salesPlanSource(state);
    if (sourceError) { setError(sourceError); return false; }
    if (!state.productName.trim() && !buyingPoints.length && !facts.trim()) {
      setError('请先采集商品资料或收录图片文字，再优化分镜；卖点提炼可跳过');
      return false;
    }
    const beatsInput: SalesPlanAdaptInput['beats'] = [];
    const manualPerformance = new Map(state.productionPlan.adaptedBeats.map((beat) => [beat.index, salesManualPerformanceEdits(state.productionPlan, beat)]));
    const manualSubjects = new Map<number, string>();
    for (const [index, edits] of manualPerformance) if (edits.subject !== undefined) manualSubjects.set(index, edits.subject);
    let idx = 0;
    activeScript.script.shots.forEach((shot, shotIndex) => {
      shot.beats.forEach((beat) => {
        const binding = beatBindings[idx];
        const edited = manualPerformance.get(idx);
        const editedAction = Boolean(edited?.action);
        beatsInput.push({
          index: idx, shotIndex, preservePerformance: Boolean(edited && Object.keys(edited).length), start: beat.start, end: beat.end,
          purpose: beat.purpose, shotSize: beat.shotSize, camera: beat.camera,
          productVisible: beat.productVisible,
          refAction: edited?.action || beat.actionTemplate || beat.action, subject: edited?.subject ?? (editedAction ? '' : beat.subject),
          sourceVoiceText: beat.voice.text, sourceLinePattern: beat.voice.linePattern, sourceSubtitle: beat.subtitle,
          scene: beat.scene, transition: edited?.transition ?? (editedAction ? '' : beat.transition), expression: edited?.expression ?? (editedAction ? '' : beat.expression),
          requiredView: beat.requiredView, assignedView: binding?.assignedView || 'untagged',
          imageLabel: beat.productVisible === false ? '本段商品不入画' : binding ? describeBoundImageLabel(binding) : '主商品图',
          buyingPoint: '', // 从完整买点按画面选取，避免按编号强配。
          ...(assembled.imitationMode === 'depth_imitation' && activeScript.depthVideoUrl
            ? { actionReference: `此脚本关联深度视频的 ${beat.start}—${beat.end} 秒动作` }
            : {}),
        });
        idx += 1;
      });
    });

    const sourceExclusions = activeScript.script.sourceExclusions.flatMap((item) =>
      item.term.split(/[、，,/；;\s]+/).map((term) => ({ term: term.trim(), type: item.type })).filter((item) => item.term.length >= 2),
    );

    const duration = resolveSalesVideoSettings(state.productionPlan, activeScript.script, assembled.references).durationSec;
    const personaPresence = activeScript.script.assetSlots.persona.presence;
    const personaImage = (['persona_identity', 'persona_body', 'persona_face'] as const)
      .map(role => assembled.references.find(ref => (ref.roles || [ref.kind]).includes(role))).find(Boolean);
    const progress = personaImage ? '正在读取人物原图的神态与姿态，融合当前商品、场景和分镜…' : assembled.effectiveVoiceMode === 'none'
      ? '正在按商品、人物与场景改写纯画面分镜…'
      : '正在按商品、人物与场景改写分镜和台词…';
    const res = await runTask('adapt', progress, (signal, onProgress) =>
      rewriteSalesScriptPlan({
        productName: state.productName,
        brand: state.brand,
        category: state.category,
        summary: summaryRes?.summary || '',
        facts,
        buyingPoints,
        allowProductReframe: assembled.imitationMode === 'script_only',
        unresolved: [...summaryRes?.conflicts || [], ...summaryRes?.questions || []],
        cautions: summaryRes?.cautions || [],
        scriptTitle: activeScript.title,
        oneTake: activeScript.script.visualSpec.oneTake,
        visualSpec: activeScript.script.visualSpec,
        voiceMode: assembled.effectiveVoiceMode,
        presentationMode: state.productionPlan.presentationMode,
        imitationMode: assembled.imitationMode,
        personaReferenceImageUrl: personaImage?.url,
        personaPresence,
        personaSummary: activeScript.script.assetSlots.persona.presence !== 'none' ? [
          salesPersonaDescription(state.productionPlan, selectedPersona),
          ...(['full_presenter', 'silent_model'].includes(activeScript.script.assetSlots.persona.presence) && activeScript.script.assetSlots.persona.styleTags.length
            ? [`原分镜人物风格（仅表演参考）：${activeScript.script.assetSlots.persona.styleTags.join('、')}`] : []),
        ].join('\n') : '按脚本限定的主体范围展示，不增加完整人物出镜',
        sceneSummary: state.productionPlan.customSceneImageUrl ? '空间布局及光源、光线以用户上传的实景参考图为准；visualSpec 仅提供兼容的摄影质感和文字镜头记录，不以原脚本光线重建空间' : selectedScene ? `${selectedScene.title}（${selectedScene.description}；以当前场景图及资产光源、光线为准；资产光线：${selectedScene.lighting}；visualSpec 仅提供兼容的摄影质感和文字镜头记录，不以原脚本光线重建空间）` : '按参考脚本的空间关系安排拍摄环境',
        sourceExclusions,
        beats: beatsInput,
      }, { sourceCopy: summaryRes ? state.productSummary!.editedCopy ?? summaryRes.copy : '', duration,
        ...(truncatedEnding ? { truncatedEnding: true } : {}),
        targetCps: Math.min(4.6, Math.max(2, activeScript.script.assetSlots.audio.targetCps || 3.8)) }, modelSelection, signal, onProgress,
      manualSubjects, rewriteCache),
    );
    if (!res) return false;
    const adaptedBeats = mergeSalesAdaptedWindow(state.productionPlan.adaptedBeats, res.beats.map((beat) => ({ ...beat,
      manualPerformanceFields: Object.keys(manualPerformance.get(beat.index) || {}) as SalesAdaptedBeat['manualPerformanceFields'],
    })), beatsInput.length);
    const reviewedState = { ...state, productionPlan: { ...state.productionPlan, adaptedBeats } };
    patchPlan({ adaptedBeats, personaVisualProfile: res.personaVisualProfile || null, adaptedSourceKey: salesPlanAdaptationSourceKey(state, activeScript.script, selectedScene), adaptedPromptVersion: res.promptVersion,
      spokenReviewPromptVersion: res.spokenReviewPromptVersion,
      spokenReviewSourceKey: res.spokenReviewPromptVersion ? salesSpokenReviewSourceKey(salesSpokenReviewInput(reviewedState, activeScript.script, beatBindings, assembled.effectiveVoiceMode, duration, truncatedEnding)) : '',
      spokenCopyPromptVersion: res.spokenCopyPromptVersion, spokenCopySourceKey: res.spokenCopyPromptVersion ? salesSpokenCopySourceKey(activeScript.script, assembled.effectiveVoiceMode, duration) : '', customPrompt: '' });
    return true;
  }, [activeScript, assembled, beatBindings, durationError, truncatedEnding, patchPlan, runTask, selectedPersona, selectedScene, setError, state]);
}
