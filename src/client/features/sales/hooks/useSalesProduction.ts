import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  assembleSalesVideoPrompt, bindBeatProductImages, describeBoundImageLabel, eligibleSalesImages,
  recommendBgms, recommendPersonas, recommendScenes, recommendVoices,
  type SalesActionCandidate, type SalesAdaptedBeat, type SalesBeatVoiceMode,
  type SalesImitationMode, type SalesPresentationMode,
} from '@shared/domain/sales';
import {
  adaptSalesScriptPlan, mixSalesFinalVideo,
  submitAndPollSalesVideo, synthesizeSalesVoiceover, uploadSalesCustomAsset,
  type SalesStudioAssetCatalog,
} from '../api/salesProduction';
import { ensureSalesAdaptationPromptCurrent } from '../api/salesProductionPrompt';
import type { SalesCollectionState } from '../model/salesCollectionDraft';
import { planForSelectedScript, type SalesProductionPlanState } from '../model/salesProductionDraft';
import { applyMaterialAction, buildSalesBeatActionReferences, reconcileSalesMaterialBindings } from '../model/salesMaterial';
import { hasCustomSalesPersona, salesPersonaDescription, selectedSalesPersona, uploadSalesPersonaReference } from '../model/salesPersonaBinding';
import { salesPlanAdaptationSourceKey, salesPlanSource, salesProductionSourceError, salesProductionSummaryIsStale } from '../model/salesPlanSource';
import { resolveSalesVideoSettings } from '../model/salesVideoSettings';
import { patchSalesProductionPlan, salesProductionOutputKeys, staleSalesProductionOutputs } from '../model/salesProductionOutputs';
import { useSalesProductionCatalog } from './useSalesProductionCatalog';
import { useSalesProductionTask } from './useSalesProductionTask';
import { useSalesProductionModels } from './useSalesProductionModels';

type ProductionBusy = '' | 'loading' | 'adapt' | 'tts' | 'video' | 'mix' | 'upload';

export function useSalesProduction(
  state: SalesCollectionState,
  onChange: (patch: Partial<SalesCollectionState>) => void,
  refreshVersion = 0,
  onOutputProduced?: () => void,
) {
  const contextKey = useMemo(() => JSON.stringify([
    state.collectedProductUrl, state.productName, state.brand, state.category, state.audience, state.sellingPoints, state.props,
    state.ocrImages, state.ocrImageUrls, state.productSummary, state.imageCatalog,
    state.colorSelection, state.variantMetadata, state.selectedScriptId, state.productionPlan,
  ]), [state]);
  const { busy: taskBusy, progressText, error, setError, runTask, cancel } = useSalesProductionTask(contextKey);
  const planRef = useRef(state.productionPlan);
  planRef.current = state.productionPlan;

  const { videoModels, voiceModels } = useSalesProductionModels();
  const summaryStale = useMemo(() => salesProductionSummaryIsStale(state), [state]);
  const currentSummary = summaryStale ? undefined : state.productSummary?.result;

  const patchPlan = useCallback((patch: Partial<SalesProductionPlanState>) => {
    planRef.current = patchSalesProductionPlan(planRef.current, patch);
    onChange({ productionPlan: planRef.current });
  }, [onChange]);

  const onCatalogLoaded = useCallback((loadedCatalog: SalesStudioAssetCatalog) => {
    const plan = reconcileSalesMaterialBindings(planRef.current, loadedCatalog);
    if (plan !== planRef.current) patchPlan(plan);
  }, [patchPlan]);
  const resources = useSalesProductionCatalog(refreshVersion, Boolean(taskBusy), onCatalogLoaded);
  const { scripts, catalog, reloadAssets } = resources;
  const busy: ProductionBusy = taskBusy || (resources.loading ? 'loading' : '');

  const activeScript = useMemo(
    () => scripts.find((item) => item.id === state.selectedScriptId) || null,
    [scripts, state.selectedScriptId],
  );

  const selectedImages = useMemo(
    () => eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata),
    [state.colorSelection, state.imageCatalog, state.variantMetadata],
  );

  const rankedPersonas = useMemo(
    () => (activeScript ? recommendPersonas(activeScript.script, state.category, catalog.personas, state.audience) : []),
    [activeScript, catalog.personas, state.audience, state.category],
  );
  const rankedScenes = useMemo(
    () => (activeScript ? recommendScenes(activeScript.script, state.category, catalog.scenes) : []),
    [activeScript, catalog.scenes, state.category],
  );

  const selectedPersona = useMemo(
    () => selectedSalesPersona(state.productionPlan, catalog.personas),
    [catalog.personas, state.productionPlan],
  );
  const selectedScene = useMemo(
    () => catalog.scenes.find((s) => s.id === state.productionPlan.sceneId) || (state.productionPlan.sceneId ? null : rankedScenes[0]?.item || null),
    [catalog.scenes, rankedScenes, state.productionPlan.sceneId],
  );
  const generationSourceError = useMemo(() => salesProductionSourceError(state, activeScript?.script.assetSlots.persona.presence !== 'none', activeScript?.script, selectedScene), [activeScript, selectedScene, state]);

  const rankedVoices = useMemo(
    () => (activeScript ? recommendVoices({ ...activeScript.script, voiceMode: state.productionPlan.presentationMode === 'clean_visual' ? 'none' : state.productionPlan.voiceModeOverride || activeScript.script.voiceMode }, selectedPersona, catalog.voices) : []),
    [activeScript, catalog.voices, selectedPersona, state.productionPlan.presentationMode, state.productionPlan.voiceModeOverride],
  );
  const rankedBgms = useMemo(
    () => (activeScript ? recommendBgms(activeScript.script, state.category, catalog.bgms) : []),
    [activeScript, catalog.bgms, state.category],
  );

  const selectedVoice = useMemo(
    () => catalog.voices.find((v) => v.id === state.productionPlan.voiceId) || rankedVoices[0]?.item || null,
    [catalog.voices, rankedVoices, state.productionPlan.voiceId],
  );
  const selectedBgm = useMemo(
    () => catalog.bgms.find((b) => b.id === state.productionPlan.bgmId) || rankedBgms[0]?.item || null,
    [catalog.bgms, rankedBgms, state.productionPlan.bgmId],
  );

  const applySmartDefaults = useCallback((resetAdapted = false) => {
    if (!activeScript) return;
    const topPersona = rankedPersonas.find((r) => r.audienceMatched !== false)?.item || null;
    const topScene = rankedScenes[0]?.item || null;
    const topVoices = recommendVoices(activeScript.script, topPersona, catalog.voices);
    const topBgm = rankedBgms[0]?.item || null;
    patchPlan({
      scriptId: activeScript.id, personaId: topPersona?.id || '', customPersonaBodyUrl: '', customPersonaFaceUrl: '',
      sceneId: topScene?.id || '', voiceId: topVoices[0]?.item.id || '', bgmId: topBgm?.id || '',
      voiceModeOverride: planRef.current.presentationMode === 'clean_visual' ? 'none' : '',
      ...(resetAdapted ? { adaptedBeats: [], adaptedSourceKey: '', adaptedPromptVersion: '', beatImageOverrides: {}, beatActionIds: {}, customPrompt: '' } : {}),
    });
  }, [activeScript, catalog.voices, patchPlan, rankedBgms, rankedPersonas, rankedScenes]);

  useEffect(() => {
    if (!activeScript || state.productionPlan.scriptId === activeScript.id) return;
    const existing = state.productionPlan;
    const matchedPersonaId = rankedPersonas.find((r) => r.audienceMatched !== false)?.item.id || '';
    patchPlan({
      ...planForSelectedScript(existing, activeScript.id),
      personaId: existing.personaId || (hasCustomSalesPersona(existing) ? '' : matchedPersonaId),
      sceneId: existing.sceneId || rankedScenes[0]?.item.id || '',
      voiceId: existing.voiceId || rankedVoices[0]?.item.id || '',
      bgmId: existing.bgmId || rankedBgms[0]?.item.id || '',
    });
  }, [activeScript, patchPlan, rankedBgms, rankedPersonas, rankedScenes, rankedVoices, state.productionPlan]);

  const beatBindings = useMemo(
    () => (activeScript ? bindBeatProductImages(activeScript.script, selectedImages, state.productionPlan.beatImageOverrides) : []),
    [activeScript, selectedImages, state.productionPlan.beatImageOverrides],
  );

  const actionReferences = useMemo(
    () => buildSalesBeatActionReferences(state.productionPlan.beatActionIds, catalog.actions),
    [catalog.actions, state.productionPlan.beatActionIds],
  );

  const assembled = useMemo(() => {
    if (!activeScript) return null;
    const points = currentSummary?.points.map((p) => [p.benefit.trim(), p.feature.trim()].filter(Boolean).join(' · ')).filter(Boolean) || [];
    return assembleSalesVideoPrompt({
      script: activeScript.script,
      aspectRatio: resolveSalesVideoSettings(state.productionPlan, activeScript.script, []).aspectRatio,
      productName: state.productName,
      productSummary: currentSummary?.summary,
      buyingPoints: points,
      selectedImages,
      beatBindings,
      adaptedBeats: state.productionPlan.adaptedBeats,
      actionReferences,
      scriptVideoReference: state.productionPlan.scriptVideoReference === 'depth' ? {
        kind: 'depth',
        url: activeScript.depthVideoUrl || '',
      } : undefined,
      persona: selectedPersona,
      customPersonaBodyUrl: state.productionPlan.customPersonaBodyUrl,
      customPersonaFaceUrl: state.productionPlan.customPersonaFaceUrl,
      scene: selectedScene,
      customSceneImageUrl: state.productionPlan.customSceneImageUrl,
      voiceModeOverride: state.productionPlan.voiceModeOverride || undefined,
      presentationMode: state.productionPlan.presentationMode,
      imitationMode: state.productionPlan.imitationMode === 'depth_imitation' && state.productionPlan.scriptVideoReference === 'depth' ? 'depth_imitation' : 'script_only',
    });
  }, [actionReferences, activeScript, beatBindings, currentSummary, selectedImages, selectedPersona, selectedScene, state.productName, state.productionPlan]);

  const outputKeys = assembled ? salesProductionOutputKeys(assembled, state.productionPlan, selectedImages, selectedVoice, selectedBgm, salesPlanAdaptationSourceKey(state, activeScript?.script, selectedScene)) : null;
  const previousOutputKeys = useRef(outputKeys);
  useEffect(() => {
    if (!outputKeys) return;
    const previous = previousOutputKeys.current;
    previousOutputKeys.current = outputKeys;
    if (!previous) return;
    const stale = staleSalesProductionOutputs(planRef.current, previous, outputKeys);
    if (Object.keys(stale).length) patchPlan(stale);
  }, [outputKeys, patchPlan]);

  const runPlanAdapt = useCallback(async (modelSelection: string) => {
    if (!activeScript || !assembled) return;
    if (activeScript.status !== 'verified') { setError('当前参考脚本尚未确认入库，请先到脚本库复核并确认后再制作'); return; }
    if ((state.productionPlan.sceneId || state.productionPlan.customSceneImageUrl) && !(state.productionPlan.customSceneImageUrl.trim() || selectedScene?.coverUrl.trim())) { setError('所选场景的参考图不可用，请重新选择场景或上传场景主图后改编；原分镜已保留。'); return; }
    const summaryRes = salesProductionSummaryIsStale(state) ? undefined : state.productSummary?.result;
    const buyingPoints = summaryRes?.points.map((p) => [p.benefit.trim(), p.feature.trim(), p.expression.trim()].filter(Boolean).join('；')).filter(Boolean) || [];
    const { facts, error: sourceError } = salesPlanSource(state);
    if (sourceError) { setError(sourceError); return; }
    if (!state.productName.trim() && !buyingPoints.length && !facts.trim()) {
      setError('请先采集商品资料或收录图片文字，再优化分镜；卖点提炼可跳过');
      return;
    }
    const beatsInput: Parameters<typeof adaptSalesScriptPlan>[0]['beats'] = [];
    let idx = 0;
    activeScript.script.shots.forEach((shot, shotIndex) => {
      shot.beats.forEach((beat) => {
        const binding = beatBindings[idx];
        beatsInput.push({
          index: idx, shotIndex, start: beat.start, end: beat.end,
          purpose: beat.purpose, shotSize: beat.shotSize, camera: beat.camera,
          refAction: beat.actionTemplate || beat.action, subject: beat.subject,
          scene: beat.scene, transition: beat.transition, expression: beat.expression,
          requiredView: beat.requiredView, assignedView: binding?.assignedView || 'untagged',
          imageLabel: binding ? describeBoundImageLabel(binding) : '主商品图',
          buyingPoint: buyingPoints[idx % Math.max(1, buyingPoints.length)] || summaryRes?.summary || state.productName,
          ...(assembled.imitationMode === 'depth_imitation' && activeScript.depthVideoUrl
            ? { actionReference: `此脚本关联深度视频的 ${beat.start}—${beat.end} 秒动作` }
            : actionReferences[idx]?.mediaType === 'image' ? { actionReference: actionReferences[idx].label } : {}),
        });
        idx += 1;
      });
    });

    const sourceExclusions = activeScript.script.sourceExclusions.flatMap((item) =>
      item.term.split(/[、，,/；;\s]+/).map((s) => s.trim()).filter((s) => s.length >= 2),
    );

    const res = await runTask('adapt', '正在结合人物、场景、商品与深度动作优化适配分镜脚本…', (signal) =>
      adaptSalesScriptPlan({
        productName: state.productName,
        brand: state.brand,
        category: state.category,
        summary: summaryRes?.summary || '',
        facts,
        buyingPoints,
        cautions: summaryRes?.cautions || [],
        scriptTitle: activeScript.title,
        oneTake: activeScript.script.visualSpec.oneTake,
        visualSpec: activeScript.script.visualSpec,
        voiceMode: assembled.effectiveVoiceMode,
        presentationMode: state.productionPlan.presentationMode,
        imitationMode: assembled.imitationMode,
        personaSummary: activeScript.script.assetSlots.persona.presence !== 'none' ? salesPersonaDescription(state.productionPlan, selectedPersona) : '按脚本限定的主体范围展示，不增加完整人物出镜',
        sceneSummary: state.productionPlan.customSceneImageUrl ? '空间布局以用户上传的实景参考图为准，摄影画风按 visualSpec' : selectedScene ? `${selectedScene.title}（${selectedScene.description}；资产光线：${selectedScene.lighting}，仅在 visualSpec 未记录光线时参考）` : '按参考脚本的空间关系安排拍摄环境',
        sourceExclusions,
        beats: beatsInput,
      }, modelSelection, signal),
    );
    if (res) patchPlan({ adaptedBeats: res.beats, adaptedSourceKey: salesPlanAdaptationSourceKey(state, activeScript.script, selectedScene), adaptedPromptVersion: res.promptVersion, customPrompt: '' });
  }, [actionReferences, activeScript, assembled, beatBindings, patchPlan, runTask, selectedPersona, selectedScene, setError, state]);

  const updateAdaptedBeat = useCallback((index: number, patch: Partial<SalesAdaptedBeat>) => {
    if (!activeScript) return;
    const beats = activeScript.script.shots.flatMap((shot) => shot.beats);
    if (!Number.isInteger(index) || !beats[index]) return;
    const current = new Map(planRef.current.adaptedBeats.map((beat) => [beat.index, beat]));
    const existing = current.get(index) || { index, subject: '', action: '', spokenLine: '', subtitle: '' };
    current.set(index, { ...existing, ...patch, index });
    patchPlan({ adaptedBeats: [...current.values()].sort((a, b) => a.index - b.index), customPrompt: '' });
  }, [activeScript, patchPlan]);

  const bindBeatAction = useCallback((beatIndex: number, asset: SalesActionCandidate | null) => {
    if (!activeScript) return;
    if (!asset) {
      const nextIds = { ...planRef.current.beatActionIds };
      delete nextIds[beatIndex];
      patchPlan({ beatActionIds: nextIds, customPrompt: '' });
      return;
    }
    patchPlan(applyMaterialAction(activeScript.script, planRef.current, asset, beatIndex));
  }, [activeScript, patchPlan]);

  const setPresentationMode = useCallback((mode: SalesPresentationMode) => {
    patchPlan({
      presentationMode: mode,
      voiceModeOverride: mode === 'clean_visual' ? 'none'
        : planRef.current.voiceModeOverride === 'none' || assembled?.effectiveVoiceMode === 'none' ? 'speech' : planRef.current.voiceModeOverride,
      customPrompt: '',
    });
  }, [assembled?.effectiveVoiceMode, patchPlan]);

  const setImitationMode = useCallback((mode: SalesImitationMode) => {
    patchPlan({ imitationMode: mode, scriptVideoReference: mode === 'depth_imitation' ? 'depth' : 'none', customPrompt: '' });
  }, [patchPlan]);

  const runSynthesizeVoice = useCallback(async () => {
    if (!assembled?.narrationText.trim()) {
      setError('请先生成或填写分镜台词，再合成配音');
      return;
    }
    const voiceCode = selectedVoice?.ttsVoice || selectedVoice?.voiceId || 'zh-female-commercial';
    const res = await runTask('tts', '正在使用音色库合成旁白配音…', (signal) =>
      synthesizeSalesVoiceover({
        text: assembled.narrationText,
        voice: voiceCode,
        model: planRef.current.voiceModel,
      }, signal),
    );
    if (res) patchPlan({ voiceoverAudioUrl: res.audioUrl });
  }, [assembled, patchPlan, runTask, selectedVoice, setError]);

  const runGenerateVideo = useCallback(async () => {
    if (!activeScript || !assembled) return;
    if (activeScript.status !== 'verified') { setError('当前参考脚本尚未确认入库，请先到脚本库复核并确认后再制作'); return; }
    if (generationSourceError) { setError(generationSourceError); return; }
    if (!selectedImages.length) { setError('请先选择至少一张当前商品图，再生成视频'); return; }
    const plan = planRef.current;
    const videoSettings = resolveSalesVideoSettings(plan, activeScript.script, assembled.references);
    if (videoSettings.validationError) { setError(videoSettings.validationError); return; }
    const res = await runTask('video', '正在核对提示词版本并准备视频任务…', async (signal, onProgress) => {
      await ensureSalesAdaptationPromptCurrent(plan, signal);
      signal.throwIfAborted();
      return submitAndPollSalesVideo({
        prompt: assembled.enginePrompt,
        model: plan.videoModel,
        durationSec: videoSettings.durationSec,
        aspectRatio: videoSettings.aspectRatio,
        refMode: videoSettings.refMode,
        resolution: videoSettings.resolution,
        images: videoSettings.images,
        videos: videoSettings.videos,
        generateAudio: assembled.effectiveVoiceMode === 'speech',
      }, onProgress, signal);
    });
    if (res) {
      patchPlan({ generatedVideoUrl: res.videoUrl, mixedVideoUrl: '' });
      if (assembled.effectiveVoiceMode !== 'voiceover' && !selectedBgm && !planRef.current.customBgmUrl) {
        onOutputProduced?.();
      }
    }
  }, [activeScript, assembled, generationSourceError, onOutputProduced, patchPlan, runTask, selectedBgm, selectedImages.length, setError]);

  const runMixFinal = useCallback(async () => {
    const sourceVideo = planRef.current.generatedVideoUrl;
    if (!sourceVideo || !assembled) {
      setError('请先生成视频（或上传待合成原片）后再合成配音与背景音乐');
      return;
    }
    if (assembled.effectiveVoiceMode === 'voiceover' && !planRef.current.voiceoverAudioUrl) {
      setError('请先为当前分镜台词合成配音，再导出旁白成片');
      return;
    }
    const res = await runTask('mix', '正在合成配音与背景音乐…', (signal) =>
      mixSalesFinalVideo({
        videoUrl: sourceVideo,
        voiceMode: assembled.effectiveVoiceMode,
        voiceoverUrl: assembled.effectiveVoiceMode === 'voiceover' && planRef.current.voiceoverAudioUrl ? planRef.current.voiceoverAudioUrl : undefined,
        bgmId: !planRef.current.customBgmUrl && selectedBgm ? selectedBgm.id : undefined,
        bgmUrl: planRef.current.customBgmUrl || undefined,
      }, signal),
    );
    if (res) {
      patchPlan({ mixedVideoUrl: res.videoUrl });
      onOutputProduced?.();
    }
  }, [assembled, onOutputProduced, patchPlan, runTask, selectedBgm, setError]);

  const uploadCustomSlot = useCallback(async (
    target: 'personaBody' | 'personaFace' | 'scene' | 'bgm' | 'rawVideo',
    file: File,
  ) => {
    const category = target === 'rawVideo' ? 'videos' : 'assets';
    const url = await runTask('upload', '正在上传自定义素材…', (signal) => uploadSalesCustomAsset(file, category, signal));
    if (!url) return;
    if (target === 'personaBody' || target === 'personaFace') patchPlan(uploadSalesPersonaReference(planRef.current, target, url));
    if (target === 'scene') patchPlan({ customSceneImageUrl: url, customPrompt: '' });
    if (target === 'bgm') patchPlan({ customBgmUrl: url, mixedVideoUrl: '' });
    if (target === 'rawVideo') patchPlan({ generatedVideoUrl: url, mixedVideoUrl: '' });
  }, [patchPlan, runTask]);

  const selectPersona = useCallback((personaId: string) => {
    const found = catalog.personas.find((p) => p.id === personaId);
    patchPlan({
      personaId,
      customPersonaBodyUrl: '',
      customPersonaFaceUrl: '',
      ...(found?.defaultVoiceId ? { voiceId: found.defaultVoiceId } : {}),
      customPrompt: '',
    });
  }, [catalog.personas, patchPlan]);

  const setVoiceMode = useCallback((mode: '' | SalesBeatVoiceMode) => {
    patchPlan({
      voiceModeOverride: mode,
      presentationMode: mode === 'none' ? 'clean_visual' : 'subtitled_intro',
      customPrompt: '',
    });
  }, [patchPlan]);

  return {
    scripts, catalog, activeScript, selectedImages, beatBindings, assembled,
    rankedPersonas, rankedScenes, rankedVoices, rankedBgms,
    selectedPersona, selectedScene, selectedVoice, selectedBgm,
    videoModels, voiceModels, generationSourceError,
    busy, progressText, error: error || resources.error, clearError: () => { setError(''); resources.clearError(); },
    cancel,
    reloadAssets, patchPlan, applySmartDefaults, selectPersona, setVoiceMode,
    setPresentationMode, setImitationMode, bindBeatAction,
    runPlanAdapt, updateAdaptedBeat, runSynthesizeVoice, runGenerateVideo, runMixFinal, uploadCustomSlot,
  };
}
