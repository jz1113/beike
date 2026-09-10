import type { GenerationTask } from '@/store/useAppStore';
import {
  cleanPromptText,
  stripWorkshopPromptGuards,
  normalizeReferenceMentions,
  findUnresolvedMentions,
  extractPromptMentions,
  mentionTokenToName,
  isStandardImageMention,
  isGenericSubjectMention,
} from '@beike/shared/drawing';
import {
  DEPTH_IMAGE_LIMITS,
  DEPTH_IMAGE_MODEL_ID,
  DEPTH_VIDEO_LIMITS,
  DEPTH_VIDEO_MODEL_ID,
  isDepthGenMode,
  type DepthQuality,
  type DepthVideoStyle,
  type QuickGenMode,
} from '@beike/shared/depthVideo';
import '@/lib/mediaHelper';
import { isVideoFile } from '@/lib/mediaUpload';
import { resolveRefMediaFile, resolveRefMediaName } from '@/lib/refMediaRegistry';
import { resolveSubjectByMention } from '../components/prompt-bar/RichPromptInput';
import { formatSubjectName, type SubjectItem } from '../data/promptBarConstants';

export interface PromptBarSubmitInput {
  quickGenMode: QuickGenMode;
  quickPrompt: string;
  quickRefImages: string[];
  activeSubjects: SubjectItem[];
  allSubjects: SubjectItem[];
  quickVideoRefMode: string;
  quickVideoFirstFrame: string | null;
  quickVideoLastFrame: string | null;
  quickVideoMultiFrames: string[];
  quickCount: number;
  quickVideoCount: number;
  quickModel: string;
  quickVideoModel: string;
  sizeStr: string;
  quickQuality: string;
  quickVideoAspectId: string;
  quickVideoResolution: string;
  quickVideoDuration: number;
  currentView: string;
  hasImageModels: boolean;
  quickDepthStyle: DepthVideoStyle;
  quickDepthQuality: DepthQuality;
  quickVideoGenerateAudio?: boolean;
  refMediaFile?: File | null;
  depthModelReady?: boolean;
}

export type PromptBarSubmitResult =
  | { ok: false; error: string }
  | {
      ok: true;
      tasks: GenerationTask[];
      cleanedPrompt: string;
      sessionTitle: string;
      shouldCreateNewSession: boolean;
    };

function collectEffectiveImages(input: PromptBarSubmitInput): string[] {
  const {
    quickGenMode,
    quickPrompt,
    quickRefImages,
    allSubjects,
    quickVideoRefMode,
    quickVideoFirstFrame,
    quickVideoLastFrame,
    quickVideoMultiFrames,
  } = input;

  if (isDepthGenMode(quickGenMode)) {
    return quickRefImages.length > 0 ? [quickRefImages[0]] : [];
  }

  const referencedImages: string[] = [];
  const mentionRegex =
    /(@(?:insp_\d+|图片\d+|主体\d*|模特\d*|[a-zA-Z0-9_\u4e00-\u9fa5.-]+)|\{\{\s*(?:Mixed|Image|图)?\s*\d+\s*\}\})/gi;
  const allMatches = Array.from(quickPrompt.matchAll(mentionRegex));

  allMatches.forEach((m) => {
    const tag = m[0];
    const resolved = resolveSubjectByMention(tag, allSubjects, quickRefImages);
    if (resolved && !referencedImages.includes(resolved.url)) {
      referencedImages.push(resolved.url);
    }
  });

  if (quickGenMode === 'video') {
    if (quickVideoRefMode === 'first_last_frame') {
      const frames: string[] = [];
      if (quickVideoFirstFrame) frames.push(quickVideoFirstFrame);
      if (quickVideoLastFrame) frames.push(quickVideoLastFrame);
      return frames;
    }
    if (quickVideoRefMode === 'multi_frame') {
      return [...quickVideoMultiFrames];
    }
    return Array.from(new Set([...referencedImages, ...quickRefImages]));
  }

  return Array.from(new Set([...referencedImages, ...quickRefImages]));
}

function buildOrderedMentionNames(
  effectiveImages: string[],
  allSubjects: SubjectItem[],
): string[] {
  return effectiveImages.map((url, idx) => {
    const subject = allSubjects.find((s) => s.url === url);
    return subject?.name || `图片${idx + 1}`;
  });
}

function validatePromptMentions(
  prompt: string,
  allSubjects: SubjectItem[],
  quickRefImages: string[],
  orderedMentionNames: string[],
): string | null {
  if (!prompt.trim()) return null;

  const unresolvedByName = findUnresolvedMentions(prompt, orderedMentionNames);
  if (unresolvedByName.length > 0) {
    return `提示词中的 @${unresolvedByName[0]} 未匹配到参考图，请重新上传并 @ 选择，或改为 @图片1`;
  }

  for (const token of extractPromptMentions(prompt)) {
    const name = mentionTokenToName(token);
    if (!name || isStandardImageMention(name) || isGenericSubjectMention(name)) continue;
    const seqMatch = name.match(/^(?:主体|模特|参考图|商品图|主图|图片|图|insp_|insp)(\d+)$/i);
    if (seqMatch) {
      const idx = parseInt(seqMatch[1], 10) - 1;
      if (idx >= 0 && (allSubjects[idx] || quickRefImages[idx])) continue;
    }
    const resolved = resolveSubjectByMention(token, allSubjects, quickRefImages);
    if (!resolved) {
      return `提示词中的 @${name} 未匹配到参考图，请重新上传并 @ 选择，或改为 @图片1`;
    }
  }

  return null;
}

/** 发送按钮 / 快捷键是否与提交校验一致 */
export function canSubmitPromptBar(
  input: PromptBarSubmitInput & { isSubmitting?: boolean },
): boolean {
  if (input.isSubmitting) return false;
  if (input.quickGenMode === 'image' && !input.hasImageModels) return false;
  if (isDepthGenMode(input.quickGenMode) && input.depthModelReady === false) return false;
  const effectiveImages = collectEffectiveImages(input);
  return validationError(input, effectiveImages) === null;
}

function validationError(input: PromptBarSubmitInput, effectiveImages: string[]): string | null {
  const { quickGenMode, quickPrompt, quickVideoRefMode, hasImageModels, refMediaFile } = input;

  if (isDepthGenMode(quickGenMode)) {
    if (effectiveImages.length === 0) {
      return quickGenMode === 'depth-image' ? '请上传一张图片' : '请上传一段视频';
    }
    if (!refMediaFile) {
      return '无法读取上传文件，请重新上传';
    }
    if (quickGenMode === 'depth-image' && refMediaFile.size > DEPTH_IMAGE_LIMITS.maxBytes) {
      return `图片过大，请控制在 ${Math.round(DEPTH_IMAGE_LIMITS.maxBytes / 1024 / 1024)}MB 以内`;
    }
    if (quickGenMode === 'depth-video' && refMediaFile.size > DEPTH_VIDEO_LIMITS.maxDataUrlBytes) {
      return `视频过大，请控制在 ${Math.round(DEPTH_VIDEO_LIMITS.maxDataUrlBytes / 1024 / 1024)}MB 以内`;
    }
    if (quickGenMode === 'depth-image' && isVideoFile(refMediaFile)) {
      return '深度图片模式请上传图片文件';
    }
    if (quickGenMode === 'depth-video' && !isVideoFile(refMediaFile)) {
      return '深度视频模式请上传视频文件';
    }
    if (input.depthModelReady === false) {
      return '深度模型未就绪，请先安装深度模型';
    }
    return null;
  }

  if (quickGenMode === 'image' && !hasImageModels) {
    return '请先在设置中从网关拉取生图模型';
  }

  if (!quickPrompt.trim() && effectiveImages.length === 0) {
    if (quickGenMode === 'video' && quickVideoRefMode === 'first_last_frame') {
      return '请输入描述你想生成的视频提示词，或上传首帧/尾帧图片';
    }
    if (quickGenMode === 'video' && quickVideoRefMode === 'multi_frame') {
      return '请添加智能多帧的镜头或输入视频生成描述';
    }
    return quickGenMode === 'video'
      ? '请输入描述你想生成的视频提示词或上传参考素材'
      : '请输入描述你想生成的图片提示词或选择图片主体';
  }

  if (quickGenMode === 'image' && quickPrompt.trim()) {
    const orderedMentionNames = buildOrderedMentionNames(effectiveImages, input.allSubjects);
    const mentionError = validatePromptMentions(
      quickPrompt,
      input.allSubjects,
      input.quickRefImages,
      orderedMentionNames,
    );
    if (mentionError) return mentionError;
  }

  return null;
}

export function buildPromptBarGenerationTasks(
  input: PromptBarSubmitInput,
): PromptBarSubmitResult {
  const effectiveImages = collectEffectiveImages(input);
  const error = validationError(input, effectiveImages);
  if (error) {
    return { ok: false, error };
  }

  const {
    quickGenMode,
    quickPrompt,
    quickCount,
    quickVideoCount,
    quickModel,
    quickVideoModel,
    sizeStr,
    quickQuality,
    quickVideoAspectId,
    quickVideoResolution,
    quickVideoDuration,
    quickVideoRefMode,
    currentView,
    quickDepthStyle,
    quickDepthQuality,
    quickVideoGenerateAudio,
  } = input;

  if (isDepthGenMode(quickGenMode)) {
    const batchTimestamp = Date.now();
    const batchId = `batch-${batchTimestamp}`;
    const isDepthVideo = quickGenMode === 'depth-video';
    const refUrl = effectiveImages[0];
    const task: GenerationTask = {
      id: `hub-gen-${batchTimestamp}-0`,
      batchId,
      shotNo: 1,
      title: isDepthVideo ? '深度动作捕捉' : '深度图片',
      prompt: isDepthVideo ? '深度动作捕捉' : '深度图片',
      mediaType: quickGenMode,
      depthStyle: quickDepthStyle,
      model: isDepthVideo ? DEPTH_VIDEO_MODEL_ID : DEPTH_IMAGE_MODEL_ID,
      size: '-',
      quality: quickDepthQuality,
      referenceImageUrl: refUrl,
      referenceImages: [refUrl],
      useReferenceImage: true,
      status: 'IN_PROGRESS',
      progress: '15%',
      createdAt: batchTimestamp,
    };
    return {
      ok: true,
      tasks: [task],
      cleanedPrompt: task.prompt,
      sessionTitle: task.title,
      shouldCreateNewSession: currentView !== 'generate',
    };
  }

  let finalPrompt = quickPrompt.trim();
  if (effectiveImages.length > 0) {
    finalPrompt = finalPrompt
      .replace(/\{\{\s*(?:Mixed|Image|图)?\s*1\s*\}\}/gi, '@图片1')
      .replace(/\{\{\s*(?:Mixed|Image|图)?\s*2\s*\}\}/gi, '@图片2')
      .replace(/\{\{\s*(?:Mixed|Image|图)?\s*3\s*\}\}/gi, '@图片3');
    const orderedMentionNames = buildOrderedMentionNames(effectiveImages, input.allSubjects);
    finalPrompt = normalizeReferenceMentions(finalPrompt, orderedMentionNames);
  }

  const cleanedPrompt = stripWorkshopPromptGuards(cleanPromptText(finalPrompt));
  const batchId = `batch-${Date.now()}`;
  const batchTimestamp = Date.now();
  const countToGen = quickGenMode === 'video' ? quickVideoCount || 1 : quickCount || 1;
  const refImg = effectiveImages[0] || undefined;
  const tasksToCreate: GenerationTask[] = [];

  for (let i = 0; i < countToGen; i++) {
    const taskId = `hub-gen-${batchTimestamp}-${i}`;
    tasksToCreate.push({
      id: taskId,
      batchId,
      shotNo: i + 1,
      title: quickPrompt.slice(0, 25) || (quickGenMode === 'video' ? '智能视频创作' : '快速商用生图'),
      prompt: cleanedPrompt,
      mediaType: quickGenMode,
      model: quickGenMode === 'video' ? quickVideoModel : quickModel,
      size: quickGenMode === 'video' ? quickVideoAspectId : sizeStr,
      quality: quickGenMode === 'video' ? quickVideoResolution : quickQuality,
      videoDuration: quickGenMode === 'video' ? quickVideoDuration : undefined,
      videoResolution: quickGenMode === 'video' ? quickVideoResolution : undefined,
      videoRefMode: quickGenMode === 'video' ? quickVideoRefMode : undefined,
      generateAudio: quickGenMode === 'video' ? quickVideoGenerateAudio : undefined,
      referenceImageUrl: refImg,
      referenceImages: effectiveImages.length > 0 ? effectiveImages : undefined,
      images: effectiveImages.length > 0 ? effectiveImages : undefined,
      useReferenceImage: effectiveImages.length > 0,
      status: 'IN_PROGRESS',
      progress: '15%',
      createdAt: batchTimestamp,
    });
  }

  return {
    ok: true,
    tasks: tasksToCreate,
    cleanedPrompt,
    sessionTitle:
      cleanedPrompt.slice(0, 18) || (quickGenMode === 'video' ? '智能视频创作' : '快速商用生图'),
    shouldCreateNewSession: currentView !== 'generate',
  };
}

export function buildPromptBarSubjects(opts: {
  customSubjects: SubjectItem[];
  quickRefImages: string[];
  refImageNames: Record<string, string>;
  images?: { url: string; type?: string; title?: string; name?: string }[];
}): SubjectItem[] {
  const ordered: { id: string; url: string; defaultName?: string }[] = [];
  const seen = new Set<string>();

  const pushUnique = (id: string, url: string, defaultName?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    ordered.push({ id, url, defaultName });
  };

  opts.quickRefImages.forEach((url, idx) => {
    pushUnique(`ref-${idx}`, url, opts.refImageNames[url]);
  });

  if (ordered.length === 0 && opts.images && opts.images.length > 0) {
    opts.images.forEach((img, idx) => {
      pushUnique(`prod-${idx}`, img.url, img.title || img.name);
    });
  }

  opts.customSubjects.forEach((s) => {
    pushUnique(s.id, s.url, s.name);
  });

  return ordered.map((item, idx) => {
    const rawName =
      opts.refImageNames[item.url] ||
      resolveRefMediaName(item.url) ||
      resolveRefMediaFile(item.url)?.name ||
      item.defaultName ||
      opts.customSubjects.find((s) => s.id === item.id || s.url === item.url)?.name;

    const cleanName = rawName?.replace(/\.[^/.]+$/, '').trim();

    return {
      id: item.id,
      url: item.url,
      name: cleanName || formatSubjectName(idx),
    };
  });
}
