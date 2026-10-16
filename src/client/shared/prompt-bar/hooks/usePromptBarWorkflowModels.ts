import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@client/store';
import {
  getEnabledImageModelsFromSettings,
  getEnabledVideoModelsFromSettings,
  getEnabledMultimodalModelsFromSettings,
  readWorkflowModelsFromStorage,
  repairWorkflowModelsInStorage,
} from '@shared/domain/models/workflowModels';
import { VIDEO_GEN_MODELS } from '@shared/domain/media/video';
import { IMAGE_GEN_MODELS } from '@shared/domain/media/drawing';
import { listApprovedModels, vendorLabel } from '@shared/domain/models/modelCatalog';

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
}

export const SMART_VIDEO_MODEL: PreferenceModelItem = {
  id: 'smart',
  name: '智能匹配模型',
  desc: '当识别到视频生成诉求时为你智能选择视频模型',
  isSmart: true,
  isDiamond: true,
  isNew: true,
};

export const SMART_IMAGE_MODEL: PreferenceModelItem = {
  id: 'smart',
  name: '智能匹配模型',
  desc: '当识别到图片生成诉求时为你智能选择图片模型',
  isSmart: true,
  isDiamond: true,
  isNew: true,
};

export function usePreferenceModels() {
  const [videoModels, setVideoModels] = useState<PreferenceModelItem[]>([]);
  const [imageModels, setImageModels] = useState<PreferenceModelItem[]>([]);
  const [multimodalModels, setMultimodalModels] = useState<PreferenceModelItem[]>([]);

  const reload = useCallback(() => {
    repairWorkflowModelsInStorage();
    const all = readWorkflowModelsFromStorage();

    // 1. 视频模型
    const customVideo = getEnabledVideoModelsFromSettings(all);
    const videoSource: PreferenceModelItem[] = customVideo.length > 0
      ? customVideo.map((m) => ({
          id: m.id,
          name: m.shortName || m.name || m.id,
          desc: m.description || '高品质视频生成模型，动作流畅稳定',
          badge: m.badge,
          tag: m.badge || (m.isPrimary ? '推荐' : undefined),
          isDiamond: Boolean(m.isPrimary || ['kling', 'seedance', 'hailuo', 'smart', 'sora', 'veo'].some((k) => m.id.toLowerCase().includes(k))),
          isNew: Boolean(m.id.toLowerCase().includes('3.5') || m.id.toLowerCase().includes('2.6') || m.id.toLowerCase().includes('2.5') || m.id.toLowerCase().includes('01')),
          provider: m.provider,
          supportedDurations: m.supportedDurations,
          supportedResolutions: m.supportedResolutions,
          supportedAspectRatios: m.supportedAspectRatios,
        }))
      : VIDEO_GEN_MODELS.map((m) => ({
          id: m.id,
          name: m.shortName || m.name || m.id,
          desc: m.description || '高品质视频生成模型，动作流畅稳定',
          badge: m.badge,
          tag: m.badge || (m.isPrimary ? '推荐' : undefined),
          isDiamond: Boolean(m.isPrimary || ['kling', 'seedance', 'hailuo', 'sora', 'veo'].some((k) => m.id.toLowerCase().includes(k))),
          isNew: Boolean(m.isNew || m.id.toLowerCase().includes('3.5') || m.id.toLowerCase().includes('2.6') || m.id.toLowerCase().includes('2.5')),
          provider: m.provider,
          supportedDurations: m.supportedDurations,
          supportedResolutions: m.supportedResolutions as string[],
          supportedAspectRatios: m.supportedAspectRatios,
        }));
    setVideoModels([SMART_VIDEO_MODEL, ...videoSource]);

    // 2. 生图模型
    const customImage = getEnabledImageModelsFromSettings(all);
    const imageSource: PreferenceModelItem[] = customImage.length > 0
      ? customImage.map((m) => ({
          id: m.id,
          name: m.shortName || m.name || m.id,
          desc: m.description || '超高质感商用生图，设计表现极佳',
          badge: m.badge,
          tag: m.badge || (m.isPrimary ? '推荐' : undefined),
          isDiamond: Boolean(m.isPrimary || ['recraft', 'smart', 'flux', 'ideogram', 'gpt-image'].some((k) => m.id.toLowerCase().includes(k))),
          isNew: Boolean(m.id.toLowerCase().includes('v3') || m.id.toLowerCase().includes('2.5') || m.id.toLowerCase().includes('ultra')),
          provider: m.provider,
          supportedResolutions: ['1K', '2K', '4K'],
        }))
      : IMAGE_GEN_MODELS.map((m) => ({
          id: m.id,
          name: m.shortName || m.name || m.id,
          desc: m.description || '超高质感商用生图，设计表现极佳',
          badge: m.badge,
          tag: m.badge || (m.isPrimary ? '推荐' : undefined),
          isDiamond: Boolean(m.isPrimary || ['recraft', 'smart', 'flux', 'ideogram', 'gpt-image'].some((k) => m.id.toLowerCase().includes(k))),
          isNew: Boolean(m.id.toLowerCase().includes('v3') || m.id.toLowerCase().includes('2.5') || m.id.toLowerCase().includes('ultra')),
          provider: m.provider,
          supportedResolutions: ['1K', '2K', '4K'],
        }));
    setImageModels([SMART_IMAGE_MODEL, ...imageSource]);

    // 3. 推理 / 多模态模型
    const customMultimodal = getEnabledMultimodalModelsFromSettings(all, 'assistant');
    const multimodalSource: PreferenceModelItem[] = customMultimodal.length > 0
      ? customMultimodal.map((m) => ({
          id: m.id,
          name: m.shortName || m.name || m.id,
          desc: m.description || m.desc || (m.isThinking ? '深度思考模型，复杂问题从容应对' : '高智能多模态对话模型，快速响应日常创作'),
          badge: m.badge,
          tag: m.badge || (m.channel === 'deepseek' ? 'DeepSeek 官方' : m.channel === 'openai' ? 'OpenAI 渠道' : m.isThinking ? '深度思考' : '会员限免'),
          isDiamond: Boolean(m.isThinking || ['gpt-6', 'gpt-5.6', 'claude-3-7', 'deepseek'].some((k) => m.id.toLowerCase().includes(k))),
          isNew: Boolean(m.id.toLowerCase().includes('5.6') || m.id.toLowerCase().includes('6-') || m.id.toLowerCase().includes('v4') || m.id.toLowerCase().includes('k3') || m.id.toLowerCase().includes('3.8')),
          isThinking: Boolean(m.isThinking),
          provider: m.provider,
        }))
      : listApprovedModels('multimodal').map((m) => ({
          id: m.id,
          name: m.shortName || m.name,
          desc: m.description || (m.isThinking ? '深度思考模型，复杂问题从容应对' : '高智能多模态对话模型，快速响应日常创作'),
          badge: m.badge,
          tag: m.badge || (m.isThinking ? '深度思考' : '会员限免'),
          isDiamond: Boolean(m.isThinking || ['gpt-6', 'gpt-5.6', 'claude-3-7', 'deepseek'].some((k) => m.id.toLowerCase().includes(k))),
          isNew: Boolean(m.id.toLowerCase().includes('5.6') || m.id.toLowerCase().includes('6-') || m.id.toLowerCase().includes('v4') || m.id.toLowerCase().includes('k3') || m.id.toLowerCase().includes('3.8')),
          isThinking: Boolean(m.isThinking),
          provider: vendorLabel(m.vendor),
        }));
    setMultimodalModels(multimodalSource);
  }, []);

  useEffect(() => {
    reload();
    const handleStorage = (e: StorageEvent) => {
      if (!e.key || ['custom_models', 'ai_image_gen_model', 'ai_video_gen_model', 'beike_assistant_selected_model'].includes(e.key)) {
        reload();
      }
    };
    window.addEventListener('models_updated', reload);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('models_updated', reload);
      window.removeEventListener('storage', handleStorage);
    };
  }, [reload]);

  return { videoModels, imageModels, multimodalModels, reload };
}

export function usePromptBarWorkflowModels(
  setQuickModel?: (id: string) => void,
  setQuickVideoModel?: (id: string) => void,
) {
  const [availableImageModels, setAvailableImageModels] = useState<ReturnType<typeof getEnabledImageModelsFromSettings>>([]);
  const [availableVideoModels, setAvailableVideoModels] = useState<ReturnType<typeof getEnabledVideoModelsFromSettings>>([]);
  const [availableMultimodalModels, setAvailableMultimodalModels] = useState<ReturnType<typeof getEnabledMultimodalModelsFromSettings>>([]);

  useEffect(() => {
    const loadCustomModels = () => {
      const all = readWorkflowModelsFromStorage();
      const customImage = getEnabledImageModelsFromSettings(all);
      const customVideo = getEnabledVideoModelsFromSettings(all);
      const customMultimodal = getEnabledMultimodalModelsFromSettings(all, 'assistant');

      setAvailableImageModels(customImage);
      if (setQuickModel) {
        if (!customImage.length) setQuickModel('');
        if (customImage.length > 0) {
          const activeModel = useAppStore.getState().quickModel;
          if (activeModel && customImage.some((m) => m.id === activeModel)) {
            /* keep */
          } else {
            const savedImg = localStorage.getItem('ai_image_gen_model');
            if (savedImg && customImage.some((m) => m.id === savedImg)) {
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
          if (activeVid && customVideo.some((m) => m.id === activeVid)) {
            /* keep */
          } else {
            const savedVid = localStorage.getItem('ai_video_gen_model');
            if (savedVid && customVideo.some((m) => m.id === savedVid)) {
              setQuickVideoModel(savedVid);
            } else {
              setQuickVideoModel(customVideo[0].id as string);
            }
          }
        }
      }

      setAvailableMultimodalModels(customMultimodal);
    };

    loadCustomModels();
    window.addEventListener('models_updated', loadCustomModels);
    return () => window.removeEventListener('models_updated', loadCustomModels);
  }, [setQuickModel, setQuickVideoModel]);

  return { availableImageModels, availableVideoModels, availableMultimodalModels };
}
