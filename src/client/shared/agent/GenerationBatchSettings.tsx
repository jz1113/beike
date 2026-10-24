import { useEffect, useState } from 'react';
import { getModelCredentials } from '@client/shared/api/gatewayClient';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { agentTriggerModelName } from '@client/shared/prompt-bar/controls/PromptBarModelPickerModal';
import { EXTENDED_IMAGE_RATIO_ITEMS } from '@client/shared/prompt-bar/promptBarConstants';
import {
  loadPromptPreferences,
  savePromptPreferences,
  type ImageInferenceStrength,
  type ImageQualityTier,
  type ImageResolutionOption,
  type PromptComposerPreferences,
  type VideoAspectOption,
} from '@client/shared/prompt-bar/promptBarPreferencesTypes';
import {
  imageResolutionLabel,
  PromptBarImageTab,
  qualityForResolution,
} from '@client/shared/prompt-bar/controls/preferences/PromptBarImageTab';
import { PromptBarVideoTab } from '@client/shared/prompt-bar/controls/preferences/PromptBarVideoTab';
import {
  matchesStoredModel,
  usePreferenceModels,
  type PreferenceModelItem,
} from '@client/shared/prompt-bar/hooks/usePromptBarWorkflowModels';
import { useAppStore } from '@client/store';
import { imageCapabilities } from '@shared/domain/media/imageCapabilities';
import { DEFAULT_MODALITY_MODELS } from '@shared/domain/models/modalityDefaults';
import { readEffectiveModalityModels, upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import type { BatchGenerationSettings } from './buildGenerationPromptBatch';

export function resolvePreferredBatchModel(
  kind: 'image' | 'video',
  current: string,
  models: readonly PreferenceModelItem[],
): string {
  if (!models.length) return '';
  const storageKey = kind === 'image' ? 'ai_image_gen_model' : 'ai_video_gen_model';
  const initialFallback = kind === 'image' ? 'gpt-image-2' : 'doubao-seedance-2.0-mini';
  const currentMatch = current ? models.find((model) => matchesStoredModel(model, current)) : undefined;
  if (currentMatch && current !== initialFallback) return currentMatch.id;

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const savedMatch = models.find((model) => matchesStoredModel(model, saved));
      if (savedMatch) return savedMatch.id;
    }
  } catch { /* Storage is optional in headless tests. */ }

  const read = readEffectiveModalityModels(kind);
  if (read.configured) {
    const seedIds = new Set((DEFAULT_MODALITY_MODELS[kind] || []).map((item) => item.id));
    const isSyncedOrCustom = (item: (typeof read.models)[number]) => (
      Boolean(item.isCustom || item.channelId || !seedIds.has(item.id))
    );
    const preferred = read.models.find((item) => item.isDefault && isSyncedOrCustom(item))
      || read.models.find((item) => isSyncedOrCustom(item))
      || read.models.find((item) => item.isDefault)
      || read.models[0];
    if (preferred) {
      const match = models.find(
        (model) => matchesStoredModel(model, preferred.id) || matchesStoredModel(model, preferred.modelId),
      );
      if (match) return match.id;
    }
  }

  return currentMatch?.id || models[0].id;
}

export function resolveBatchModelSummary(
  kind: 'image' | 'video',
  current: string,
  models: readonly PreferenceModelItem[],
): { id: string; upstreamId: string; label: string } {
  const selected = models.find((model) => matchesStoredModel(model, current));
  const upstreamId = selected?.upstreamId
    || upstreamModalityModelId(kind, current)
    || selected?.id
    || current;
  const label = upstreamId
    ? agentTriggerModelName(upstreamId, selected?.name || upstreamId)
    : (kind === 'video' ? '未配置视频模型' : '未配置图片模型');
  return { id: selected?.id || current, upstreamId, label };
}

export function syncBatchSettingsStore(update: Partial<BatchGenerationSettings>) {
  const state = useAppStore.getState();
  if (update.imageModel !== undefined) {
    state.setQuickModel(update.imageModel);
    try { if (update.imageModel) localStorage.setItem('ai_image_gen_model', update.imageModel); } catch { /* ignore */ }
  }
  if (update.imageAspect !== undefined) state.setQuickAspectId(update.imageAspect);
  if (update.imageQuality !== undefined) state.setQuickQuality(update.imageQuality);
  if (update.videoModel !== undefined) {
    state.setQuickVideoModel(update.videoModel);
    try { if (update.videoModel) localStorage.setItem('ai_video_gen_model', update.videoModel); } catch { /* ignore */ }
  }
  if (update.videoAspect !== undefined) state.setQuickVideoAspectId(update.videoAspect);
  if (update.videoResolution !== undefined) state.setQuickVideoResolution(update.videoResolution);
  if (update.videoDuration !== undefined) state.setQuickVideoDuration(update.videoDuration);
  if (update.videoRefMode !== undefined) state.setQuickVideoRefMode(update.videoRefMode);
}

export default function GenerationBatchSettings({
  value,
  onChange,
  image,
  video,
  disabled = false,
}: {
  value: BatchGenerationSettings;
  onChange: (value: BatchGenerationSettings, changed?: Partial<BatchGenerationSettings>) => void;
  image: boolean;
  video: boolean;
  disabled?: boolean;
}) {
  const { ready, imageModels, videoModels } = usePreferenceModels();
  const [prefs, setPrefs] = useState<PromptComposerPreferences>(() => loadPromptPreferences());

  const persistPrefs = (next: PromptComposerPreferences) => {
    setPrefs(next);
    savePromptPreferences(next);
  };

  const patch = (update: Partial<BatchGenerationSettings>) => {
    const next = { ...value, ...update };
    onChange(next, update);
    syncBatchSettingsStore(update);
  };

  useEffect(() => {
    if (!ready) return;
    const updates: Partial<BatchGenerationSettings> = {};
    if (image && imageModels.length > 0) {
      const nextImage = resolvePreferredBatchModel('image', value.imageModel, imageModels);
      if (nextImage && nextImage !== value.imageModel) updates.imageModel = nextImage;
    }
    if (video && videoModels.length > 0) {
      const nextVideo = resolvePreferredBatchModel('video', value.videoModel, videoModels);
      if (nextVideo && nextVideo !== value.videoModel) updates.videoModel = nextVideo;
    }
    if (Object.keys(updates).length > 0) patch(updates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, image, video, imageModels, videoModels]);

  const selectedImage = imageModels.find((model) => matchesStoredModel(model, value.imageModel));
  const resolvedImageModel = selectedImage?.upstreamId
    || upstreamModalityModelId('image', value.imageModel)
    || value.imageModel;
  const credentials = getModelCredentials(resolvedImageModel);
  const imageCaps = imageCapabilities(resolvedImageModel, credentials.protocol, credentials.baseUrl);
  const allowedResolutions = imageCaps.resolutions;
  const allowedAspectRatios = imageCaps.aspectRatios;

  useEffect(() => {
    if (!image) return;
    const isExtended = EXTENDED_IMAGE_RATIO_ITEMS.some((item) => item.id === value.imageAspect);
    if (!isExtended || allowedAspectRatios?.includes(value.imageAspect)) return;
    patch({ imageAspect: '3:4' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, resolvedImageModel, (allowedAspectRatios || []).join(','), value.imageAspect]);

  useEffect(() => {
    if (!image || !allowedResolutions.length) return;
    const current = imageResolutionLabel(value.imageQuality);
    if (allowedResolutions.includes(current)) return;
    const fallback = allowedResolutions[allowedResolutions.length - 1];
    patch({ imageQuality: qualityForResolution(fallback) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, resolvedImageModel, allowedResolutions.join(','), value.imageQuality]);

  const selectedVideo = videoModels.find((model) => matchesStoredModel(model, value.videoModel));
  const resolvedVideoModel = selectedVideo?.upstreamId
    || upstreamModalityModelId('video', value.videoModel)
    || value.videoModel;

  return (
    <div className="space-y-3">
      {image && (
        <fieldset className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <legend className="text-xs font-semibold text-slate-800 dark:text-slate-100">图片设置</legend>
            <div className="w-full sm:w-72">
              <ConfiguredModelPicker
                ariaLabel="批量图片模型"
                modalityKind="image"
                options={imageModels}
                value={selectedImage?.id || value.imageModel}
                disabled={disabled}
                onChange={(imageModel) => patch({ imageModel })}
              />
            </div>
          </div>
          <PromptBarImageTab
            compact
            aspect={value.imageAspect}
            resolution={imageResolutionLabel(value.imageQuality)}
            strength={value.imageInferenceStrength || prefs.image.inferenceStrength}
            quality={value.imageQualityTier || prefs.image.quality || value.imageQuality}
            allowedResolutions={allowedResolutions}
            allowedQualities={imageCaps.qualities}
            allowedAspectRatios={allowedAspectRatios}
            strengthMode={imageCaps.strength}
            onAspect={(aspect) => {
              patch({ imageAspect: aspect });
              persistPrefs({ ...prefs, image: { ...prefs.image, aspect: aspect as PromptComposerPreferences['image']['aspect'] } });
            }}
            onResolution={(resolution: ImageResolutionOption) => {
              patch({ imageQuality: qualityForResolution(resolution) });
              persistPrefs({ ...prefs, image: { ...prefs.image, resolution } });
            }}
            onStrength={(strength: ImageInferenceStrength) => {
              patch({ imageInferenceStrength: strength });
              persistPrefs({ ...prefs, image: { ...prefs.image, inferenceStrength: strength } });
            }}
            onQuality={(quality: ImageQualityTier) => {
              patch({
                imageQualityTier: quality,
                ...(quality === 'low' || quality === 'medium' || quality === 'high' ? { imageQuality: quality } : {}),
              });
              persistPrefs({ ...prefs, image: { ...prefs.image, quality } });
            }}
          />
        </fieldset>
      )}

      {video && (
        <fieldset className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <legend className="text-xs font-semibold text-slate-800 dark:text-slate-100">视频设置</legend>
            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
              <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white/95 px-3 text-xs font-medium text-slate-700 shadow-2xs dark:border-white/10 dark:bg-[#1B1C20]/95 dark:text-slate-200">
                <input
                  aria-label="视频生成音频"
                  type="checkbox"
                  disabled={disabled}
                  checked={value.videoGenerateAudio ?? false}
                  onChange={(event) => patch({ videoGenerateAudio: event.target.checked })}
                  className="h-3.5 w-3.5 accent-slate-900 dark:accent-white"
                />
                生成音频
              </label>
              <div className="min-w-[200px] flex-1 sm:w-64 sm:flex-initial">
                <ConfiguredModelPicker
                  ariaLabel="批量视频模型"
                  modalityKind="video"
                  options={videoModels}
                  value={selectedVideo?.id || value.videoModel}
                  disabled={disabled}
                  onChange={(videoModel) => patch({ videoModel })}
                />
              </div>
            </div>
          </div>
          <PromptBarVideoTab
            compact
            modelId={resolvedVideoModel}
            supportedAspectRatios={selectedVideo?.supportedAspectRatios}
            supportedResolutions={selectedVideo?.supportedResolutions}
            mode={value.videoRefMode}
            aspect={value.videoAspect}
            resolution={value.videoResolution}
            duration={value.videoDuration}
            onMode={(videoRefMode) => patch({ videoRefMode })}
            onAspect={(videoAspect) => {
              patch({ videoAspect });
              persistPrefs({ ...prefs, video: { ...prefs.video, aspect: (videoAspect === 'adaptive' ? 'smart' : videoAspect) as VideoAspectOption } });
            }}
            onResolution={(videoResolution) => {
              const nextResolution = videoResolution as BatchGenerationSettings['videoResolution'];
              patch({ videoResolution: nextResolution });
              persistPrefs({ ...prefs, video: { ...prefs.video, resolution: nextResolution } });
            }}
            onDuration={(videoDuration) => {
              patch({ videoDuration });
              persistPrefs({ ...prefs, video: { ...prefs.video, durationMode: 'custom', customDurationSec: videoDuration } });
            }}
          />
        </fieldset>
      )}
    </div>
  );
}
