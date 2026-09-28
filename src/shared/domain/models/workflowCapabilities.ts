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

  const isAudio =
    !isEmbedding &&
    (lower.includes('audio') ||
      lower.includes('tts') ||
      lower.includes('whisper') ||
      lower.includes('suno') ||
      lower.includes('speech') ||
      lower.includes('voice') ||
      lower.includes('music') ||
      lower.includes('sound') ||
      lower.includes('elevenlabs'));

  const isVideo =
    !isEmbedding &&
    !isAudio &&
    (lower.includes('video') ||
      lower.includes('seedance') ||
      lower.includes('veo') ||
      lower.includes('kling') ||
      lower.includes('sora') ||
      lower.includes('vidu') ||
      lower.includes('minimax') ||
      isKnownVideoOnlyModel(id));

  const isImage =
    !isEmbedding &&
    !isAudio &&
    !isVideo &&
    (lower.includes('image') ||
      lower.includes('flux') ||
      lower.includes('seedream') ||
      lower.includes('midjourney') ||
      lower.includes('mjv') ||
      lower.includes('nano-banana') ||
      isKnownImageOnlyModel(id));

  const isThinking =
    lower.includes('thinking') ||
    lower.includes('reasoner') ||
    lower.includes('luna');

  const isMultimodal =
    !isEmbedding &&
    !isAudio &&
    !isVideo &&
    !isImage &&
    (lower.includes('vision') ||
      lower.includes('gemini') ||
      lower.includes('claude') ||
      /gpt-[45]/.test(lower) ||
      lower.includes('grok-4') ||
      lower.includes('qwen3') ||
      lower.includes('deepseek') ||
      lower.includes('kimi'));

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
