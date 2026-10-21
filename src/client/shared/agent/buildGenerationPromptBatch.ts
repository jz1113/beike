import type { GenerationTask, MediaAttachment } from '@client/store/appStoreTypes';
import type { GenerationPromptEntry } from '@shared/domain/assistant/generationPrompts';
import { GENERATION_BATCH_LIMIT } from '@shared/domain/assistant/generationPrompts';
import { buildPromptBarGenerationTasks, type PromptBarSubmitInput } from '@client/shared/prompt-bar/promptBarSubmit';
import { resolveGptImageSizeForModel } from '@shared/domain/models/model-adapters/image/gptImageSafeSizes';
import { upstreamModalityModelId, modalityPickerSelections } from '@shared/domain/models/modalityStorage';
import { getEnabledImageModelsFromSettings, getEnabledVideoModelsFromSettings, readWorkflowModelsFromStorage } from '@shared/domain/models/workflowModels';
import { prepareAssistantImagePrompt, prepareBatchVideoPrompt } from './batchReferences';

export interface BatchPromptDraft extends GenerationPromptEntry { referenceIndexes?: number[] }
export interface BatchGenerationSettings {
  imageModel: string; imageAspect: string; imageQuality: 'high' | 'medium' | 'low';
  videoModel: string; videoAspect: string; videoResolution: '480P' | '540P' | '720P' | '1080P' | '2K' | '4K'; videoDuration: number; videoRefMode: string; videoGenerateAudio?: boolean;
}

export function availableBatchModels(kind: 'image' | 'video') {
  const synced = modalityPickerSelections(kind);
  if (synced) return synced.map(item => ({ id: item.id, name: item.name, modelId: item.modelId }));
  const settings = readWorkflowModelsFromStorage();
  const models = kind === 'image' ? getEnabledImageModelsFromSettings(settings) : getEnabledVideoModelsFromSettings(settings);
  return models.map(item => ({ id: item.id, name: item.name || item.id, modelId: item.id }));
}

function imageSize(aspect: string, model: string, quality: string) {
  if (/gpt-image/i.test(model)) return resolveGptImageSizeForModel(aspect, model, quality as 'high' | 'medium' | 'low');
  const [a, b] = aspect.split(':').map(Number);
  if (!a || !b) throw new Error('图片比例无效');
  const side = quality === 'high' ? 1536 : quality === 'low' ? 768 : 1024;
  return `${Math.round(side * a / Math.max(a, b))}x${Math.round(side * b / Math.max(a, b))}`;
}

/** All entries are prepared before any state mutation or network dispatch. */
export function buildGenerationPromptBatch(entries: BatchPromptDraft[], media: MediaAttachment[], settings: BatchGenerationSettings, validateModels = true): GenerationTask[] {
  if (!entries.length || entries.length > GENERATION_BATCH_LIMIT) throw new Error(`每次请选择 1–${GENERATION_BATCH_LIMIT} 项`);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('任务清单中存在重复条目');
  const batchId = `prompt-batch-${crypto.randomUUID()}`;
  return entries.map((entry, index) => {
    try {
      if (/(?:使用|引用|基于|等待|采用|以).{0,12}(?:上(?:面|述|一)[^\n]{0,8}(?:生成|成品)|第\s*\d+\s*(?:项|张).{0,8}(?:生成结果|成品))/.test(entry.prompt)) throw new Error(entry.issue || '此项依赖其他生成结果，请先补齐成品参考素材并移除依赖描述。');
      const video = entry.mediaType === 'video';
      const model = video ? settings.videoModel : settings.imageModel;
      if (!model) throw new Error(`请选择${video ? '视频' : '图片'}模型`);
      if (validateModels && !availableBatchModels(video ? 'video' : 'image').some(item => item.id === model || item.modelId === model)) throw new Error('所选模型未启用，请在设置中同步模型后重新选择');
      if (entry.referenceIndexes?.some(i => !media[i]?.url)) throw new Error('参考素材已失效');
      // Keep original numbered slots when only some inputs are enabled.
      const imageMedia = entry.referenceIndexes ? media.map((item, i) => entry.referenceIndexes!.includes(i) ? item : { ...item, url: '', thumbnailUrl: undefined }) : media;
      const videoPrepared = video ? prepareBatchVideoPrompt(entry.prompt, media, entry.referenceIndexes) : undefined;
      const prepared = videoPrepared || prepareAssistantImagePrompt(entry.prompt, imageMedia);
      const imageRefs = videoPrepared?.imageUrls || prepared.urls;
      const mode = video ? settings.videoRefMode : 'omni';
      const resolvedModel = upstreamModalityModelId(video ? 'video' : 'image', model) || model;
      const aspect = entry.aspect || (video ? settings.videoAspect : settings.imageAspect);
      const input: PromptBarSubmitInput = {
        quickGenMode: video ? 'video' : 'image', quickPrompt: prepared.prompt.replace(/--ar\s+\d+:\d+/g, '').trim(),
        quickRefImages: prepared.urls, activeSubjects: [], allSubjects: [], quickVideoRefMode: mode,
        quickVideoFirstFrame: imageRefs[0] || null, quickVideoLastFrame: imageRefs.length >= 2 ? imageRefs.at(-1)! : null,
        quickVideoMultiFrames: imageRefs, quickCount: 1, quickVideoCount: 1,
        quickModel: settings.imageModel, quickVideoModel: settings.videoModel,
        sizeStr: video ? aspect : imageSize(aspect, resolvedModel, settings.imageQuality), quickQuality: settings.imageQuality,
        quickVideoAspectId: aspect, quickVideoResolution: settings.videoResolution, quickVideoDuration: entry.duration ?? settings.videoDuration,
        quickVideoGenerateAudio: settings.videoGenerateAudio,
        currentView: 'generate', hasImageModels: true, hasVideoModels: true, quickDepthStyle: 'mocap', quickDepthQuality: 'standard',
      };
      if (video && ['first_frame', 'first_last_frame'].includes(mode) && (prepared.urls.length !== (mode === 'first_frame' ? 1 : 2) || imageRefs.length !== prepared.urls.length)) throw new Error(mode === 'first_frame' ? '首帧模式需要恰好一张图片' : '首尾帧模式需要恰好两张图片，按素材顺序作为首帧、尾帧');
      const result = buildPromptBarGenerationTasks(input);
      if (!result.ok) throw new Error(result.error);
      return { ...result.tasks[0], ...(video ? {} : { imageQuality: settings.imageQuality }), id: `prompt-task-${crypto.randomUUID()}`, batchId, shotNo: index + 1, title: entry.title, progress: '0%',
        ...(video && ['first_frame', 'first_last_frame'].includes(mode) ? { firstFrameImage: imageRefs[0], lastFrameImage: mode === 'first_last_frame' ? imageRefs.at(-1) : undefined } : {}) };
    } catch (error) { throw new Error(`${entry.title}：${error instanceof Error ? error.message : '参数无效'}`); }
  });
}
