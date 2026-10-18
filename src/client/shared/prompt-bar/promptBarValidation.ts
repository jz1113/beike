import {
  isDepthGenMode,
  DEPTH_IMAGE_LIMITS,
  DEPTH_VIDEO_LIMITS,
} from '@shared/domain/media/depthVideo';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { isVideoFile } from '@client/shared/api/mediaUpload';
import { videoInputError } from '@shared/domain/media/videoCapabilities';
import {
  mediaReferenceSlots,
  normalizeVideoReferenceMentions,
} from '@client/shared/media/videoReferences';
import {
  normalizeReferenceMentions,
  findUnresolvedMentions,
  extractPromptMentions,
  mentionTokenToName,
  isStandardImageMention,
  isGenericSubjectMention,
  PROMPT_MENTION_REGEX,
  parseSubjectMention,
} from '@shared/domain/media/drawing';
import { resolveSubjectByMention } from './promptMentions';
import { normalizeSubjectReferences } from './promptSubjectReferences';
import { formatSubjectName, type SubjectItem } from './promptBarConstants';
import { resolveRefMediaFile, resolveRefMediaName } from '@client/shared/media/refMediaRegistry';
import type { PromptBarSubmitInput } from './promptBarSubmitTypes';

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

export function collectEffectiveImages(input: PromptBarSubmitInput): string[] {
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
  const mentionRegex = new RegExp(PROMPT_MENTION_REGEX.source, 'gi');
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
    return Array.from(new Set([...quickRefImages, ...referencedImages]));
  }

  return Array.from(new Set([...quickRefImages, ...referencedImages]));
}

export function buildOrderedMentionNames(
  effectiveImages: string[],
  allSubjects: SubjectItem[],
): string[] {
  return effectiveImages.map((url, idx) => {
    const subject = allSubjects.find((s) => s.url === url);
    return subject?.name || `图片${idx + 1}`;
  });
}

export function validatePromptMentions(
  prompt: string,
  allSubjects: SubjectItem[],
  quickRefImages: string[],
  orderedMentionNames: string[],
  effectiveImages: string[],
): string | null {
  if (!prompt.trim()) return null;

  const slots = effectiveImages.map((url, index) => ({ url, name: `图片${index + 1}` }));
  const normalizedPrompt = normalizeReferenceMentions(
    normalizeSubjectReferences(prompt, slots),
    orderedMentionNames,
  );
  const unresolvedByName = findUnresolvedMentions(normalizedPrompt, orderedMentionNames);
  if (unresolvedByName.length > 0) {
    return `提示词中的 @${unresolvedByName[0]} 未匹配到参考图，请重新上传并 @ 选择，或改为 @图片1`;
  }

  for (const token of extractPromptMentions(normalizedPrompt)) {
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

export function validateSubmitInput(
  input: PromptBarSubmitInput,
  effectiveImages: string[],
): string | null {
  const { quickGenMode, quickPrompt, quickVideoRefMode, hasImageModels, hasVideoModels, refMediaFile } = input;

  if (quickGenMode === 'agent') {
    if (!quickPrompt.trim() && effectiveImages.length === 0) {
      return '请输入与 Agent 助手交流的内容';
    }
    return null;
  }

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

  if (quickGenMode === 'video' && hasVideoModels === false) {
    return '请先在设置中从网关拉取视频模型';
  }

  if (quickGenMode === 'audio') {
    if (input.hasAudioModels === false) {
      return '请先在设置中配置音频模型';
    }
    if (!input.quickAudioModel?.trim()) {
      return '请先选择已同步的音频模型';
    }
    if (!quickPrompt.trim()) {
      return '请输入你想朗读或合成的音频文本内容';
    }
    return null;
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

  if (quickGenMode === 'video') {
    if (!quickPrompt.trim()) return '请补充视频的动作、镜头或编辑要求';
    const mediaError = videoInputError({
      model: input.quickVideoModel,
      refMode: quickVideoRefMode,
      images: effectiveImages.filter((url) => !isVideoMediaUrl(url)),
      videos: effectiveImages.filter(isVideoMediaUrl),
      duration: input.quickVideoDuration,
      resolution: input.quickVideoResolution,
      aspectRatio: input.quickVideoAspectId,
    });
    if (mediaError) return mediaError;
    const normalized = normalizeVideoReferenceMentions(quickPrompt, effectiveImages, input.allSubjects);
    const slots = new Set(mediaReferenceSlots(effectiveImages).map((slot) => slot.name));
    for (const token of extractPromptMentions(normalized)) {
      const name = mentionTokenToName(token);
      if (parseSubjectMention(token) || !slots.has(name)) {
        return `提示词中的 @${name} 未匹配到参考素材，请重新选择或移除引用`;
      }
    }
  }

  if (quickGenMode === 'image' && quickPrompt.trim()) {
    const orderedMentionNames = buildOrderedMentionNames(effectiveImages, input.allSubjects);
    const mentionError = validatePromptMentions(
      quickPrompt,
      input.allSubjects,
      input.quickRefImages,
      orderedMentionNames,
      effectiveImages,
    );
    if (mentionError) return mentionError;
  }

  return null;
}
