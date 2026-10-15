import type { ModalityKind, ModalityModelItem } from './modalityModelTypes';

function seed(
  id: string,
  name: string,
  modality: ModalityKind,
  vendor: string,
  modelId: string,
  extra?: Partial<ModalityModelItem>,
): ModalityModelItem {
  return { id, name, modality, vendor, modelId, isInfrequent: false, ...extra };
}

export const DEFAULT_MODALITY_MODELS: Record<ModalityKind, ModalityModelItem[]> = {
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
    seed('chat_bytedance', '豆包', 'chat', 'bytedance', 'doubao-pro-vision-32k'),
    seed('chat_xiaomi', '小米', 'chat', 'xiaomi', 'mimo-v2-flash'),
  ],
  image: [
    seed('img_openai', 'GPT Image', 'image', 'openai', 'gpt-image-2', { isDefault: true }),
    seed('img_google', 'Imagen', 'image', 'google', 'imagen-3.0-generate'),
    seed('img_meta', 'Meta', 'image', 'meta', 'meta-llama'),
    seed('img_mj', 'Midjourney', 'image', 'midjourney', 'midjourney'),
    seed('img_bytedance', 'Seedream', 'image', 'bytedance', 'seedream-3.0'),
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
    seed('3d_tripo', 'Tripo', 'three_d', 'tripo', 'tripo'),
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
};
