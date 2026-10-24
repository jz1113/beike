import type { TextProtocol } from './textProtocol';

export type ModalityStorageKind = 'chat' | 'image' | 'video' | 'three_d' | 'music' | 'voice' | 'avatar';

export interface StoredModalityModelItem {
  id: string;
  name: string;
  modality: ModalityStorageKind;
  vendor?: string;
  modelId: string;
  textProtocol?: TextProtocol;
  apiTemplate?: string;
  apiKey?: string;
  baseUrl?: string;
  isInfrequent?: boolean;
  isCustom?: boolean;
  isDefault?: boolean;
  namePinned?: boolean;
  /** 空值表示全局默认渠道。非空时对应服务商配置里的 ApiProvider.id。 */
  channelId?: string;
}

export type DefaultModalityModel = StoredModalityModelItem & { vendor: string };

function seed(
  id: string,
  name: string,
  modality: ModalityStorageKind,
  vendor: string,
  modelId: string,
  extra?: Partial<DefaultModalityModel>,
): DefaultModalityModel {
  return { id, name, modality, vendor, modelId, isInfrequent: false, ...extra };
}

/** 设置页与前台共用的模态默认模型。空列表和占位项会补回这些模型；用户解除过的种子不会再自动补回。 */
export const DEFAULT_MODALITY_MODELS: Record<ModalityStorageKind, DefaultModalityModel[]> = {
  chat: [
    seed('chat_openai_gpt', 'GPT', 'chat', 'openai', 'gpt-5.6-luna'),
    seed('chat_google_gemini', 'Gemini', 'chat', 'google', 'gemini-3-flash-preview-thinking-128', { isDefault: true }),
    seed('chat_anthropic_claude', 'Claude', 'chat', 'anthropic', 'claude-3-7-sonnet-20250219'),
    seed('chat_xai_grok', 'Grok', 'chat', 'xai', 'grok-4.6'),
    seed('chat_deepseek', 'DeepSeek', 'chat', 'deepseek', 'deepseek-chat'),
    seed('chat_moonshot', 'Moonshot', 'chat', 'moonshot', 'moonshot-v1-auto'),
    seed('chat_minimax', 'MiniMax', 'chat', 'minimax', 'abab6.5s-chat'),
    seed('chat_glm', 'GLM', 'chat', 'glm', 'glm-4v'),
    seed('chat_qwen', 'Qwen', 'chat', 'qwen', 'qwen-vl-max'),
  ],
  image: [
    seed('img_openai', 'GPT Image', 'image', 'openai', 'gpt-image-2', { isDefault: true }),
    seed('img_google', 'Nano Banana', 'image', 'google', 'gemini-nano-banana-2.1'),
    seed('img_mj', 'Midjourney', 'image', 'midjourney', 'midjourney'),
    seed('img_xai', 'Grok Image', 'image', 'xai', 'grok-image'),
    seed('img_kling', 'Kolors', 'image', 'kling', 'kling-image'),
    seed('img_qwen', 'Qwen Image', 'image', 'qwen', 'qwen-image'),
  ],
  video: [
    seed('vid_bytedance', 'Seedance', 'video', 'bytedance', 'doubao-seedance-2.5', { isDefault: true }),
    seed('vid_openai', 'Sora', 'video', 'openai', 'sora-2'),
    seed('vid_google', 'Veo', 'video', 'google', 'veo-3.1'),
    seed('vid_flux', 'Flux', 'video', 'flux', 'flux-video'),
    seed('vid_xai', 'Grok Video', 'video', 'xai', 'grok-video'),
    seed('vid_minimax', 'MiniMax Video', 'video', 'minimax', 'video-01'),
    seed('vid_qwen', 'Wan', 'video', 'qwen', 'wan-video'),
    seed('vid_kling', 'Kling', 'video', 'kling', 'kling-v2-master'),
    seed('vid_vidu', 'Vidu', 'video', 'vidu', 'vidu-2.0'),
    seed('vid_mj', 'MJ Video', 'video', 'midjourney', 'midjourney-video'),
    seed('vid_topaz', 'Topaz', 'video', 'topaz', 'topaz-video-upscale'),
  ],
  three_d: [
    seed('3d_hunyuan_fal', 'Hunyuan 3D', 'three_d', 'hunyuan', 'fal-ai/hunyuan-3d/v3.1/pro', { isDefault: true }),
  ],
  music: [
    seed('music_suno', 'Suno', 'music', 'suno', 'suno', { isDefault: true }),
    seed('music_elevenlabs', 'ElevenLabs', 'music', 'elevenlabs', 'elevenlabs-music'),
    seed('music_minimax', 'MiniMax Music', 'music', 'minimax', 'minimax-music'),
  ],
  voice: [
    seed('voice_minimax', 'MiniMax Speech', 'voice', 'minimax', 'speech-2.8-hd', { isDefault: true }),
    seed('voice_xai', 'xAI Voice', 'voice', 'xai', 'grok-voice'),
    seed('voice_qwen', 'Qwen Voice', 'voice', 'qwen', 'cosyvoice-v2'),
    seed('voice_google', 'Google Voice', 'voice', 'google', 'gemini-tts'),
    seed('voice_bytedance', '字节语音', 'voice', 'bytedance', 'doubao-tts'),
  ],
  avatar: [],
};
