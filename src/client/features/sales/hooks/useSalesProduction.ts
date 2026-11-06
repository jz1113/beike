import { useSalesVoiceRecovery } from './useSalesVoiceRecovery';
import { useSalesMix } from './useSalesMix';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  assembleSalesVideoPrompt, bindBeatProductImages, eligibleSalesImages,
  recommendBgms, recommendPersonas, recommendScenes, recommendVoices,
  type SalesActionCandidate, type SalesAdaptedBeat, type SalesBeatVoiceMode,
  type SalesImitationMode, type SalesPresentationMode,
  type AssembleSalesPromptInput,
} from '@shared/domain/sales';
import {
  submitAndPollSalesVideo, synthesizeSalesVoiceover, uploadSalesCustomAsset,
  type SalesStudioAssetCatalog,
} from '../api/salesProduction';
import { prepareSalesProductionVideos } from '../api/salesDepthReference';
import { ensureSalesProductionPromptsCurrent } from '../api/salesProductionPrompt';
import { reviewSalesProductionSpeech } from '../api/salesProductionReview';
import type { SalesCollectionState } from '../model/salesCollectionDraft';
import { planForSelectedScript, type SalesProductionPlanState } from '../model/salesProductionDraft';
import { applyMaterialAction, reconcileSalesMaterialBindings } from '../model/salesMaterial';
import { hasCustomSalesPersona, selectedSalesPersona, uploadSalesPersonaReference } from '../model/salesPersonaBinding';
import { salesPlanAdaptationSourceKey, salesPlanSource, salesProductionSourceError, salesProductionSummaryIsStale } from '../model/salesPlanSource';
import { resolveSalesVideoSettings } from '../model/salesVideoSettings';
import { resolveSalesProductionTimeline } from '../model/salesProductionTimeline';
import { salesSpokenCopySourceKey } from '../model/salesSpokenCopySource';
import { updateSalesManualPerformance } from '../model/salesPerformanceEdits';
import { patchSalesProductionPlan, salesProductionOutputKeys, staleSalesProductionOutputs } from '../model/salesProductionOutputs';
import { useSalesProductionCatalog } from './useSalesProductionCatalog';
import { useSalesProductionTask } from './useSalesProductionTask';
import { useSalesProductionModels } from './useSalesProductionModels';
import { useSalesPlanAdapt } from './useSalesPlanAdapt';
import { useSalesVideoRecovery } from './useSalesVideoRecovery';

type ProductionBusy = '' | 'loading' | 'adapt' | 'tts' | 'video' | 'mix' | 'upload';

export function useSalesProduction(
  state: SalesCollectionState,
  onChange: (patch: Partial<SalesCollectionState>) => void,
  refreshVersion = 0,
  onOutputProduced?: () => void,
) {
  const contextKey = useMemo(() => JSON.stringify([
    state.activeProductId, state.collectedProductUrl, state.productName, state.brand, state.category, state.audience, state.sellingPoints, state.props,
    state.ocrImages, state.ocrImageUrls, state.productSummary, state.imageCatalog,
    state.colorSelection, state.variantMetadata, state.selectedScriptId,
    { ...state.productionPlan, productFaceEdits: undefined, pendingVideoTask: null, spokenReviewPromptVersion: '', spokenReviewSourceKey: '' },
  ]), [state]);
  const { busy: taskBusy, progressText, error, errorPromptId, setError, notice, setNotice, clearNotice, runTask, cancel } = useSalesProductionTask(contextKey);
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

  const sourceScript = useMemo(
    () => scripts.find((item) => item.id === state.selectedScriptId) || null,
    [scripts, state.selectedScriptId],
  );
  const durationPlanning = useMemo(() => sourceScript ? resolveSalesProductionTimeline(state.productionPlan, sourceScript.script) : null,
    [sourceScript, state.productionPlan]);
  const activeScript = useMemo(() => sourceScript && durationPlanning ? { ...sourceScript, script: durationPlanning.script } : null,
    [durationPlanning, sourceScript]);

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
    () => catalog.scenes.find((s) => s.id === state.productionPlan.sceneId) || null,
    [catalog.scenes, state.productionPlan.sceneId],
  );

  const rankedVoices = useMemo(
    () => (activeScript ? recommendVoices({ ...activeScript.script, voiceMode: state.productionPlan.presentationMode === 'clean_visual' ? 'none' : state.productionPlan.voiceModeOverride || activeScript.script.voiceMode }, selectedPersona, catalog.voices) : []),
    [activeScript, catalog.voices, selectedPersona, state.productionPlan.presentationMode, state.productionPlan.voiceModeOverride],
  );
  const rankedBgms = useMemo(
    () => (activeScript ? recommendBgms(activeScript.script, state.category, catalog.bgms) : []),
    [activeScript, catalog.bgms, state.category],
  );

  const selectedVoice = useMemo(
    () => catalog.voices.find((v) => v.id === state.productionPlan.voiceId) || null,
    [catalog.voices, state.productionPlan.voiceId],
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
      ...(resetAdapted ? { adaptedBeats: [], adaptedSourceKey: '', adaptedPromptVersion: '', spokenCopySourceKey: '', spokenCopyPromptVersion: '', spokenReviewPromptVersion: '', spokenReviewSourceKey: '', beatImageOverrides: {}, beatActionIds: {}, customPrompt: '' } : {}),
    });
  }, [activeScript, catalog.voices, patchPlan, rankedBgms, rankedPersonas, rankedScenes]);

  useEffect(() => {
    if (!activeScript || state.productionPlan.scriptId === activeScript.id) return;
    const existing = state.productionPlan;
    const matchedPersonaId = rankedPersonas.find((r) => r.audienceMatched !== false)?.item.id || '';
    patchPlan({
      ...planForSelectedScript(existing, activeScript.id),
      personaId: existing.personaId || (hasCustomSalesPersona(existing) ? '' : matchedPersonaId),
      bgmId: existing.bgmId || rankedBgms[0]?.item.id || '',
    });
  }, [activeScript, patchPlan, rankedBgms, rankedPersonas, state.productionPlan]);

  const beatBindings = useMemo(
    () => (activeScript ? bindBeatProductImages(activeScript.script, selectedImages, state.productionPlan.beatImageOverrides) : []),
    [activeScript, selectedImages, state.productionPlan.beatImageOverrides],
  );

  const imitationMode = state.productionPlan.imitationMode === 'depth_imitation' && state.productionPlan.scriptVideoReference === 'depth' ? 'depth_imitation' : 'script_only';
  const finalVideoPromptId = imitationMode === 'depth_imitation' ? 'final-video-depth' : 'final-video';
  const finalVideoPrompt = resources.finalVideoPrompts.find((prompt) => prompt.id === finalVideoPromptId);

  const assembled = useMemo(() => {
    if (!activeScript) return null;
    const points = currentSummary?.points.map((p) => [p.benefit.trim(), p.feature.trim()].filter(Boolean).join(' · ')).filter(Boolean) || [];
    const input: AssembleSalesPromptInput = {
      finalVideoTemplate: finalVideoPrompt?.prompt, model: state.productionPlan.videoModel,
      script: activeScript.script,
      productName: state.productName,
      productFacts: salesPlanSource(state).facts,
      productSummary: currentSummary?.summary,
      buyingPoints: points,
      selectedImages,
      beatBindings,
      adaptedBeats: state.productionPlan.adaptedBeats,
      scriptVideoReference: state.productionPlan.scriptVideoReference === 'depth' ? {
        kind: 'depth',
        url: activeScript.depthVideoUrl || '',
      } : undefined,
      persona: selectedPersona,
      personaVisualProfile: state.productionPlan.personaVisualProfile,
      customPersonaBodyUrl: state.productionPlan.customPersonaBodyUrl,
      customPersonaFaceUrl: state.productionPlan.customPersonaFaceUrl,
      scene: selectedScene,
      customSceneImageUrl: state.productionPlan.customSceneImageUrl,
      voiceModeOverride: state.productionPlan.voiceModeOverride || undefined,
      voice: selectedVoice,
      voiceAudioUrl: state.productionPlan.voiceoverAudioUrl,
      videoVoiceId: state.productionPlan.videoVoiceId,
      presentationMode: state.productionPlan.presentationMode,
      imitationMode, truncatedEnding: durationPlanning?.truncatedEnding,
    };
    const facts = assembleSalesVideoPrompt(input);
    const settings = resolveSalesVideoSettings(state.productionPlan, activeScript.script, facts.references, facts.audios || []);
    return assembleSalesVideoPrompt({ ...input, model: settings.model, aspectRatio: settings.aspectRatio, refMode: settings.refMode, durationSec: settings.durationSec, resolution: settings.resolution });
  }, [activeScript, beatBindings, currentSummary, durationPlanning, finalVideoPrompt, imitationMode, selectedImages, selectedPersona, selectedScene, selectedVoice, state]);

  const generationSourceError = useMemo(() => durationPlanning?.error || salesProductionSourceError(state, activeScript?.script.assetSlots.persona.presence !== 'none', activeScript?.script, selectedScene,
    activeScript && assembled ? { voiceMode: assembled.effectiveVoiceMode, durationSec: resolveSalesVideoSettings(state.productionPlan, activeScript.script, assembled.references).durationSec } : undefined), [activeScript, assembled, durationPlanning, selectedScene, state]);

  const outputKeys = assembled && !assembled.templateError ? salesProductionOutputKeys(assembled, state.productionPlan, selectedImages, selectedVoice, selectedBgm, salesPlanAdaptationSourceKey(state, activeScript?.script, selectedScene), activeScript ? salesSpokenCopySourceKey(activeScript.script, assembled.effectiveVoiceMode, activeScript.script.durationSec) : '') : null;
  const previousOutputKeys = useRef(outputKeys);
  useEffect(() => {
    if (!outputKeys) return;
    const previous = previousOutputKeys.current;
    previousOutputKeys.current = outputKeys;
    if (!previous) return;
    const stale = staleSalesProductionOutputs(planRef.current, previous, outputKeys);
    if (Object.keys(stale).length) patchPlan(stale);
  }, [outputKeys, patchPlan]);

  const { rememberVideoTask } = useSalesVideoRecovery({
    plan: state.productionPlan, sourceKey: outputKeys?.video, ready: !resources.loading,
    busy: taskBusy, patchPlan, runTask,
    onRecovered: () => {
      if (assembled?.effectiveVoiceMode !== 'voiceover' && !selectedBgm && !planRef.current.customBgmUrl) onOutputProduced?.();
    },
  });

  const runPlanAdapt = useSalesPlanAdapt({
    activeScript, assembled, beatBindings, durationError: durationPlanning?.error, truncatedEnding: durationPlanning?.truncatedEnding,
    state, selectedPersona, selectedScene, patchPlan, runTask, setError,
  });

  const prepareDelivery = useCallback(async (modelSelection: string) => {
    if (busy) return false;
    if (!activeScript || !assembled) return true;
    if (!modelSelection) { setError(''); setNotice('未配置改写模型，本次使用手动分镜。'); return true; }
    const plan = planRef.current;
    // Opening delivery must never replace an existing automatic or manual draft.
    // Changed sources still block generation until the user explicitly adapts them.
    if (plan.adaptedBeats.length) {
      setError('');
      setNotice('');
      return true;
    }
    return runPlanAdapt(modelSelection);
  }, [activeScript, assembled, busy, runPlanAdapt, setError, setNotice]);

  const checkDeliveryScript = useCallback(() => {
    if (!activeScript) return true;
    if (assembled?.enginePrompt.trim() && !assembled.templateError) return true;
    setError(assembled?.templateError || '成片脚本为空，请核对分镜和最终视频生成规则。',
      finalVideoPrompt?.prompt.trim() ? '' : finalVideoPromptId);
    return false;
  }, [activeScript, assembled, finalVideoPrompt, finalVideoPromptId, setError]);

  const updateAdaptedBeat = useCallback((index: number, patch: Partial<SalesAdaptedBeat>) => {
    if (!activeScript) return;
    const beats = activeScript.script.shots.flatMap((shot) => shot.beats);
    if (!Number.isInteger(index) || !beats[index]) return;
    const current = new Map(planRef.current.adaptedBeats.map((beat) => [beat.index, beat]));
    const existing = current.get(index) || { index, subject: '', action: '', spokenLine: '', subtitle: '' };
    current.set(index, updateSalesManualPerformance(planRef.current, existing, { ...patch, index }));
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

  const rememberVoiceTask = useSalesVoiceRecovery({
    plan: state.productionPlan, sourceKey: outputKeys?.voice,
    ready: !resources.loading, busy: taskBusy, patchPlan, runTask,
  });
  const runSynthesizeVoice = useCallback(async (modelSelection = state.summaryModel) => {
    if (!assembled || assembled.effectiveVoiceMode === 'none') return;
    if (assembled.effectiveVoiceMode === 'voiceover' && (generationSourceError || assembled.templateError)) {
      setError(generationSourceError || assembled.templateError); return;
    }
    if (assembled.effectiveVoiceMode === 'voiceover' && !assembled.narrationText.trim()) {
      setError('请先生成或填写分镜台词，再合成配音');
      return;
    }
    if (!selectedVoice) { setError('请先在声音设置中选择有效的人声，再合成音频。'); return; }
    if (assembled.effectiveVoiceMode === 'speech' && selectedVoice.sampleAudioUrl.trim()) { setError('所选人声已有声音样本，可直接作为口播参考，无需另行合成。'); return; }
    const voiceCode = selectedVoice.ttsVoice.trim() || selectedVoice.voiceId.trim();
    if (!voiceCode) { setError('所选人声没有合成音色标识，请使用已有声音样本或先在声音库配置合成音色。'); return; }
    const res = await runTask('tts', assembled.effectiveVoiceMode === 'speech' ? '正在合成短音色参考…' : '正在验收口播并合成旁白…', async (signal, onProgress) => {
      const review = assembled.effectiveVoiceMode === 'voiceover' && activeScript
        ? await reviewSalesProductionSpeech(state, activeScript.script, beatBindings, assembled.effectiveVoiceMode,
          resolveSalesVideoSettings(planRef.current, activeScript.script, assembled.references).durationSec, modelSelection, signal, onProgress, durationPlanning?.truncatedEnding)
        : {};
      signal.throwIfAborted();
      patchPlan(review);
      const audio = await synthesizeSalesVoiceover({
        text: assembled.effectiveVoiceMode === 'speech' ? '你好，这是一段人声音色参考，请保持自然清晰的说话方式。' : assembled.narrationText,
        voice: voiceCode, model: planRef.current.voiceModel,
      }, signal, rememberVoiceTask);
      return { ...audio, review };
    });
    if (res) patchPlan({ ...res.review, voiceoverAudioUrl: res.audioUrl, pendingVoiceTask: null });
  }, [activeScript, assembled, beatBindings, durationPlanning, generationSourceError, patchPlan, rememberVoiceTask, runTask, selectedVoice, setError, state]);

  const runGenerateVideo = useCallback(async (modelSelection = state.summaryModel) => {
    if (!activeScript || !assembled) return;
    if (activeScript.status !== 'verified') { setError('当前参考脚本尚未确认入库，请先到脚本库复核并确认后再制作'); return; }
    if (generationSourceError) { setError(generationSourceError); return; }
    if (!selectedImages.length) { setError('请先选择至少一张当前商品图，再生成视频'); return; }
    if (assembled.templateError) { setError(assembled.templateError); return; }
    if (assembled.voiceError) { setError(assembled.voiceError); return; }
    const plan = planRef.current;
    const videoSettings = resolveSalesVideoSettings(plan, activeScript.script, assembled.references, assembled.audios || []);
    if (videoSettings.validationError) { setError(videoSettings.validationError); return; }
    const res = await runTask('video', '正在核对提示词版本并准备视频任务…', async (signal, onProgress) => {
      const review = await reviewSalesProductionSpeech(state, activeScript.script, beatBindings, assembled.effectiveVoiceMode,
        videoSettings.durationSec, modelSelection, signal, onProgress, durationPlanning?.truncatedEnding);
      signal.throwIfAborted();
      patchPlan(review);
      try { await ensureSalesProductionPromptsCurrent({ ...plan, ...review }, finalVideoPrompt?.version || '', signal, assembled.effectiveVoiceMode, finalVideoPromptId); }
      catch (err) { reloadAssets(); throw err; }
      signal.throwIfAborted();
      const videos = await prepareSalesProductionVideos({ imitationMode: assembled.imitationMode, sourceUrl: activeScript.depthVideoUrl,
        endSec: activeScript.script.durationSec, videos: videoSettings.videos, model: plan.videoModel, durationSec: videoSettings.durationSec }, signal, onProgress);
      const video = await submitAndPollSalesVideo({
        jobName: [state.productName, assembled.imitationMode === 'depth_imitation' ? '深度视频版' : '纯分镜版'].filter(Boolean).join(' · '),
        salesTrace: { scriptId: activeScript.id, scriptVersion: activeScript.version, templateVersion: finalVideoPrompt?.version || '', adaptVersion: plan.adaptedPromptVersion },
        prompt: assembled.enginePrompt,
        model: plan.videoModel,
        durationSec: videoSettings.durationSec,
        aspectRatio: videoSettings.aspectRatio,
        refMode: videoSettings.refMode,
        resolution: videoSettings.resolution,
        images: videoSettings.images,
        videos,
        audios: assembled.audios || [],
        voiceIds: assembled.voiceIds,
        generateAudio: assembled.effectiveVoiceMode === 'speech',
        contextIrEnabled: plan.videoContextIrEnabled ?? true,
      }, onProgress, signal, rememberVideoTask);
      return { ...video, review };
    });
    if (res) {
      patchPlan({ ...res.review, generatedVideoUrl: res.videoUrl, generatedVideoTaskId: res.channelTaskId || res.taskId, mixedVideoUrl: '', pendingVideoTask: null });
      if (assembled.effectiveVoiceMode !== 'voiceover' && !selectedBgm && !planRef.current.customBgmUrl) {
        onOutputProduced?.();
      }
    }
  }, [activeScript, assembled, beatBindings, durationPlanning, finalVideoPrompt, finalVideoPromptId, generationSourceError, onOutputProduced, patchPlan, reloadAssets, rememberVideoTask, runTask, selectedBgm, selectedImages.length, setError, state]);

  const runMixFinal = useSalesMix({
    plan: state.productionPlan, sourceKey: JSON.stringify([outputKeys?.mix, state.productionPlan.generatedVideoUrl, state.productionPlan.voiceoverAudioUrl, assembled?.effectiveVoiceMode]),
    voiceMode: assembled?.effectiveVoiceMode || 'none', bgm: selectedBgm,
    jobName: [state.productName, assembled?.imitationMode === 'depth_imitation' ? '深度视频版' : '纯分镜版'].filter(Boolean).join(' · '),
    ready: !resources.loading && Boolean(assembled), busy: taskBusy, patchPlan, runTask, setError, onOutputProduced,
  });

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
    scripts, catalog, sourceScript, activeScript, durationPlanning, selectedImages, beatBindings, assembled,
    rankedPersonas, rankedScenes, rankedVoices, rankedBgms,
    selectedPersona, selectedScene, selectedVoice, selectedBgm,
    videoModels, voiceModels, generationSourceError,
    busy, progressText, error: error || resources.error, errorPromptId, clearError: () => { setError(''); resources.clearError(); },
    cancel, notice, clearNotice,
    reloadAssets, patchPlan, applySmartDefaults, selectPersona, setVoiceMode,
    setPresentationMode, setImitationMode, bindBeatAction,
    prepareDelivery, checkDeliveryScript, runPlanAdapt, updateAdaptedBeat, runSynthesizeVoice, runGenerateVideo, runMixFinal, uploadCustomSlot,
  };
}
