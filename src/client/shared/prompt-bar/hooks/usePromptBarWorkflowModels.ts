import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@client/store';
import { modalityPickerSelections, type ModalityStorageKind } from '@shared/domain/models/modalityStorage';
import {
  getEnabledAudioModelsFromSettings,
  getEnabledImageModelsFromSettings,
  getEnabledVideoModelsFromSettings,
  getEnabledMultimodalModelsFromSettings,
  readWorkflowModelsFromStorage,
  repairWorkflowModelsInStorage,
} from '@shared/domain/models/workflowModels';

export interface PreferenceModelItem {
  id: string;
  name: string;
  desc: string;
  isSmart?: boolean;
  isDiamond?: boolean;
  isNew?: boolean;
  tag?: string;
  badge?: string;
  provider?: string;
  isThinking?: boolean;
  supportedAspectRatios?: string[];
  supportedResolutions?: string[];
  supportedDurations?: number[];
  /** 分组和凭证还原用的上游模型 ID。与 id 不同时，id 是渠道条目。 */
  upstreamId?: string;
}

function modalityPreferenceModels(kind: ModalityStorageKind, fallbackDesc: string): PreferenceModelItem[] | null {
  const options = modalityPickerSelections(kind);
  if (!options) return null;
  return options.map((option) => ({
    id: option.id,
    name: option.name,
    desc: fallbackDesc,
    provider: option.provider,
    upstreamId: option.modelId,
  }));
}

export function matchesStoredModel(model: { id: string; upstreamId?: string; modelId?: string }, selected: string) {
  return model.id === selected || model.upstreamId === selected || model.modelId === selected;
}

function toPreferenceModel(
  model: {
    id: string;
    name?: string;
    shortName?: string;
    description?: string;
    desc?: string;
    badge?: string;
    provider?: string;
    isThinking?: boolean;
    supportedDurations?: number[];
    supportedResolutions?: string[];
    supportedAspectRatios?: string[];
  },
  fallbackDesc: string,
): PreferenceModelItem {
  return {
    id: model.id,
    name: model.shortName || model.name || model.id,
    desc: model.description || model.desc || fallbackDesc,
    badge: model.badge,
    provider: model.provider,
    isThinking: Boolean(model.isThinking),
    supportedAspectRatios: model.supportedAspectRatios,
    supportedResolutions: model.supportedResolutions,
    supportedDurations: model.supportedDurations,
  };
}

export function usePreferenceModels() {
  const [ready, setReady] = useState(false);
  const [videoModels, setVideoModels] = useState<PreferenceModelItem[]>([]);
  const [imageModels, setImageModels] = useState<PreferenceModelItem[]>([]);
  const [audioModels, setAudioModels] = useState<PreferenceModelItem[]>([]);
  const [multimodalModels, setMultimodalModels] = useState<PreferenceModelItem[]>([]);

  const reload = useCallback(() => {
    repairWorkflowModelsInStorage();
    const all = readWorkflowModelsFromStorage();

    setVideoModels(modalityPreferenceModels('video', '已同步的视频模型')
      ?? getEnabledVideoModelsFromSettings(all).map((model) => toPreferenceModel(model, '已同步的视频模型')));
    setImageModels(modalityPreferenceModels('image', '已同步的图片模型')
      ?? getEnabledImageModelsFromSettings(all).map((model) => toPreferenceModel({
        ...model,
        supportedResolutions: ['1K', '2K', '4K'],
      }, '已同步的图片模型')));
    setAudioModels(modalityPreferenceModels('voice', '已同步的音频模型')
      ?? getEnabledAudioModelsFromSettings(all).map((model) => toPreferenceModel(model, '已同步的音频模型')));
    setMultimodalModels(modalityPreferenceModels('chat', '已同步的对话模型')
      ?? getEnabledMultimodalModelsFromSettings(all, 'assistant').map((model) => toPreferenceModel(
        model,
        model.isThinking ? '深度思考模型' : '已同步的对话模型',
      )));
    setReady(true);
  }, []);

  useEffect(() => {
    reload();
    const handleStorage = (e: StorageEvent) => {
      if (!e.key || ['custom_models', 'ai_image_gen_model', 'ai_video_gen_model', 'ai_audio_gen_model', 'beike_assistant_selected_model'].includes(e.key)) {
        reload();
      }
    };
    window.addEventListener('models_updated', reload);
    window.addEventListener('modality_models_updated', reload);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('models_updated', reload);
      window.removeEventListener('modality_models_updated', reload);
      window.removeEventListener('storage', handleStorage);
    };
  }, [reload]);

  return { ready, videoModels, imageModels, audioModels, multimodalModels, reload };
}

export function usePromptBarWorkflowModels(
  setQuickModel?: (id: string) => void,
  setQuickVideoModel?: (id: string) => void,
  setQuickAudioModel?: (id: string) => void,
) {
  const [availableImageModels, setAvailableImageModels] = useState<Array<PreferenceModelItem | ReturnType<typeof getEnabledImageModelsFromSettings>[number]>>([]);
  const [availableVideoModels, setAvailableVideoModels] = useState<Array<PreferenceModelItem | ReturnType<typeof getEnabledVideoModelsFromSettings>[number]>>([]);
  const [availableAudioModels, setAvailableAudioModels] = useState<Array<PreferenceModelItem | ReturnType<typeof getEnabledAudioModelsFromSettings>[number]>>([]);
  const [availableMultimodalModels, setAvailableMultimodalModels] = useState<Array<PreferenceModelItem | ReturnType<typeof getEnabledMultimodalModelsFromSettings>[number]>>([]);

  useEffect(() => {
    const loadCustomModels = () => {
      const all = readWorkflowModelsFromStorage();
      const syncedImage = modalityPreferenceModels('image', '已同步的图片模型');
      const syncedVideo = modalityPreferenceModels('video', '已同步的视频模型');
      const syncedAudio = modalityPreferenceModels('voice', '已同步的音频模型');
      const syncedMultimodal = modalityPreferenceModels('chat', '已同步的对话模型');
      const customImage = syncedImage ?? getEnabledImageModelsFromSettings(all);
      const customVideo = syncedVideo ?? getEnabledVideoModelsFromSettings(all);
      const customAudio = syncedAudio ?? getEnabledAudioModelsFromSettings(all);
      const customMultimodal = syncedMultimodal ?? getEnabledMultimodalModelsFromSettings(all, 'assistant');

      setAvailableImageModels(customImage);
      if (setQuickModel) {
        if (!customImage.length) setQuickModel('');
        if (customImage.length > 0) {
          const activeModel = useAppStore.getState().quickModel;
          if (activeModel && customImage.some((m) => matchesStoredModel(m, activeModel))) {
            /* keep */
          } else {
            const savedImg = localStorage.getItem('ai_image_gen_model');
            if (savedImg && customImage.some((m) => matchesStoredModel(m, savedImg))) {
              setQuickModel(savedImg);
            } else {
              setQuickModel(customImage[0].id as string);
            }
          }
        }
      }

      setAvailableVideoModels(customVideo);
      if (setQuickVideoModel) {
        if (!customVideo.length) setQuickVideoModel('');
        if (customVideo.length > 0) {
          const activeVid = useAppStore.getState().quickVideoModel;
          if (activeVid && customVideo.some((m) => matchesStoredModel(m, activeVid))) {
            /* keep */
          } else {
            const savedVid = localStorage.getItem('ai_video_gen_model');
            if (savedVid && customVideo.some((m) => matchesStoredModel(m, savedVid))) {
              setQuickVideoModel(savedVid);
            } else {
              setQuickVideoModel(customVideo[0].id as string);
            }
          }
        }
      }

      setAvailableAudioModels(customAudio);
      if (setQuickAudioModel) {
        if (!customAudio.length) setQuickAudioModel('');
        else if (!customAudio.some((model) => matchesStoredModel(model, useAppStore.getState().quickAudioModel))) {
          const savedAudio = localStorage.getItem('ai_audio_gen_model');
          setQuickAudioModel(savedAudio && customAudio.some((model) => matchesStoredModel(model, savedAudio)) ? savedAudio : customAudio[0].id);
        }
      }

      setAvailableMultimodalModels(customMultimodal);
    };

    loadCustomModels();
    window.addEventListener('models_updated', loadCustomModels);
    window.addEventListener('modality_models_updated', loadCustomModels);
    return () => {
      window.removeEventListener('models_updated', loadCustomModels);
      window.removeEventListener('modality_models_updated', loadCustomModels);
    };
  }, [setQuickModel, setQuickVideoModel, setQuickAudioModel]);

  return { availableImageModels, availableVideoModels, availableAudioModels, availableMultimodalModels };
}
