import { getApprovedModel } from './modelCatalog';

export type InferredWorkflowCapabilities = {
  isImage: boolean;
  isVideo: boolean;
  isMultimodal: boolean;
  isVision: boolean;
  isAssistant: boolean;
  isThinking: boolean;
  isEmbedding: boolean;
  isAudio: boolean;
};

export function isKnownImageOnlyModel(id: string): boolean {
  return getApprovedModel(id)?.capability === 'image';
}

export function isKnownVideoOnlyModel(id: string): boolean {
  return getApprovedModel(id)?.capability === 'video';
}

/** 根据模型 ID 推断能力标签（网关拉取 / 接入 / 修复 localStorage 共用） */
export function inferWorkflowCapabilitiesFromId(id: string): InferredWorkflowCapabilities {
  const approved = getApprovedModel(id);
  if (approved) {
    const isImage = approved.capability === 'image';
    const isVideo = approved.capability === 'video';
    const isMultimodal = approved.capability === 'multimodal';
    return {
      isImage,
      isVideo,
      isMultimodal,
      isVision: isMultimodal,
      isAssistant: isMultimodal,
      isThinking: Boolean(approved.isThinking),
      isEmbedding: false,
      isAudio: false,
    };
  }

  const lower = id.toLowerCase();

  const isEmbedding =
    lower.includes('embedding') ||
    lower.includes('embed') ||
    lower.includes('bge') ||
    lower.includes('rerank') ||
    lower.includes('baai') ||
    lower.includes('text-search') ||
    lower.includes('similarity');

  // 多模态全双工与语音交互对话模型（如 qwen-audio-chat、gpt-4o-audio），属于多模态大模型而非纯音频生成
  const isMultimodalAudioChat =
    !isEmbedding &&
    /(?:gpt-4o.*audio|qwen.*audio.*chat|qwen2-audio|gemini.*audio)/.test(lower);

  const isAudio =
    !isEmbedding &&
    !isMultimodalAudioChat &&
    (lower.includes('audio') ||
      lower.includes('tts') ||
      lower.includes('whisper') ||
      lower.includes('suno') ||
      lower.includes('speech') ||
      lower.includes('voice') ||
      lower.includes('music') ||
      lower.includes('sound') ||
      lower.includes('chirp') ||
      lower.includes('cosyvoice') ||
      /minimax-m\d/.test(lower) ||
      lower.includes('elevenlabs'));

  const isVideo =
    !isEmbedding &&
    !isAudio &&
    (lower.includes('video') ||
      lower.includes('seedance') ||
      lower.includes('veo') ||
      (lower.includes('kling') && !lower.includes('image')) ||
      lower.includes('sora') ||
      lower.includes('vidu') ||
      lower.includes('hailuo') ||
      lower.includes('minimax-h3') ||
      /(?:^|[^a-z0-9])h3(?:[^a-z0-9]|$)/.test(lower) ||
      lower.includes('i2v') ||
      lower.includes('t2v') ||
      lower.includes('s2v') ||
      /wan2?\.1.*(?:t2v|i2v|video)/.test(lower) ||
      /gen-?[234]/.test(lower) ||
      lower.includes('cogvideox') ||
      lower.includes('cogvideo') ||
      lower.includes('hunyuan-video') ||
      lower.includes('pixverse') ||
      lower.includes('ltx-video') ||
      lower.includes('skyreels') ||
      isKnownVideoOnlyModel(id));

  const isImage =
    !isEmbedding &&
    !isAudio &&
    !isVideo &&
    (lower.includes('image') ||
      lower.includes('flux') ||
      lower.includes('seedream') ||
      lower.includes('jimeng') ||
      lower.includes('midjourney') ||
      lower.includes('mj_') ||
      lower.includes('mjv') ||
      lower.includes('dall') ||
      lower.includes('sdxl') ||
      /sd-?3(?:\.5)?/.test(lower) ||
      lower.includes('stable-diffusion') ||
      lower.includes('recraft') ||
      lower.includes('ideogram') ||
      lower.includes('kolors') ||
      lower.includes('wanx') ||
      lower.includes('z-image') ||
      lower.includes('nano-banana') ||
      isKnownImageOnlyModel(id));

  const isThinking =
    lower.includes('thinking') ||
    lower.includes('reasoner') ||
    lower.includes('qwq') ||
    /(?:^|[^a-z0-9])o[134](?:-mini|-preview)?(?:[^a-z0-9]|$)/.test(lower) ||
    lower.includes('luna');

  const isMultimodal =
    !isEmbedding &&
    !isAudio &&
    !isVideo &&
    !isImage &&
    (isMultimodalAudioChat ||
      lower.includes('vision') ||
      lower.includes('gemini') ||
      lower.includes('claude') ||
      /gpt-[456]/.test(lower) ||
      /(?:^|[^a-z0-9])o[134](?:-mini|-preview)?(?:[^a-z0-9]|$)/.test(lower) ||
      lower.includes('grok') ||
      lower.includes('qwen') ||
      lower.includes('qwq') ||
      lower.includes('deepseek') ||
      lower.includes('kimi') ||
      lower.includes('abab') ||
      lower.includes('doubao') ||
      lower.includes('glm-') ||
      lower.includes('internvl'));

  return {
    isImage,
    isVideo,
    isMultimodal,
    isVision: isMultimodal,
    isAssistant: isMultimodal,
    isThinking,
    isEmbedding,
    isAudio,
  };
}
