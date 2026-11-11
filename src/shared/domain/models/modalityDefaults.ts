import { DEFAULT_MULTIMODAL_MODEL_ID, listSelectableModels } from './modelCatalog';
import type { TextProtocol } from './deepseek';

export type ModalityStorageKind = 'chat' | 'image' | 'video' | 'voice';

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

/** 使用宿主模型目录的精确上游 ID 和展示名。每个预设只指向全局渠道。 */
function catalogSeeds(kind: 'chat' | 'image' | 'video', ids: readonly string[]): DefaultModalityModel[] {
  const catalog = listSelectableModels(kind === 'chat' ? 'multimodal' : kind);
  const vendors: Record<string, string> = { alibaba: 'qwen', kuaishou: 'kling', bfl: 'flux', zhipu: 'glm' };
  return ids.map(id => {
    const model = catalog.find(item => item.id === id);
    if (!model) throw new Error(`未收录的${kind}线路：${id}`);
    return seed(`${kind}_catalog_${id}`, model.name, kind, vendors[model.vendor] ?? model.vendor, id);
  });
}

/** 设置页与前台共用的模态默认模型。空列表和占位项会补回这些模型；用户解除过的种子不会再自动补回。 */
export const DEFAULT_MODALITY_MODELS: Record<ModalityStorageKind, DefaultModalityModel[]> = {
  chat: [
    seed('chat_openai_gpt', 'GPT', 'chat', 'openai', DEFAULT_MULTIMODAL_MODEL_ID, { isDefault: true }),
    ...catalogSeeds('chat', [
      'gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-astra', 'gpt-5.6-sol', 'gemini-4-argon', 'gemini-3.8-flash',
      'claude-opus-5-5', 'claude-fable-5-1', 'claude-opus-5', 'claude-opus-4-8', 'grok-4.7',
      'deepseek-v4.1-flash', 'kimi-k3.1-pro', 'doubao-seed-2-0-pro-260215', 'glm-5.3', 'mimo-v2.6-pro',
    ]),
  ],
  image: [
    seed('img_openai', 'GPT Image', 'image', 'openai', 'gpt-image-2', { isDefault: true }),
    seed('img_google', 'Nano Banana', 'image', 'google', 'gemini-nano-banana-2.1'),
    ...catalogSeeds('image', [
      'gpt-image-2.6-sunburst', 'gpt-image-2.6-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare',
      'gemini-3.1-flash-image', 'grok-4.2-image', 'doubao-seedream-5-0-pro-260628',
      'doubao-seedream-5-0-flash-260915', 'doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128',
    ]),
  ],
  video: [
    seed('vid_bytedance', 'Seedance', 'video', 'bytedance', 'doubao-seedance-2.5', { isDefault: true }),
    seed('vid_openai', 'Sora', 'video', 'openai', 'sora-2'),
    seed('vid_google', 'Veo', 'video', 'google', 'veo-3.1'),
    ...catalogSeeds('video', [
      'veo3.1-fast', 'sora-2-pro', 'grok-imagine-video-1.5',
      'wan3.0-video', 'wan3.0-video-prime', 'doubao-seedance-2.0-mini', 'doubao-seedance-2-0-fast-260128',
      'doubao-seedance-2-0-260128', 'kling-4.0', 'kling-4.0-flash', 'MiniMax-H3', 'viduq4-preview',
    ]),
  ],
  voice: [
    seed('voice_minimax', 'MiniMax Speech', 'voice', 'minimax', 'speech-2.8-hd', { isDefault: true }),
    seed('voice_xai', 'xAI Voice', 'voice', 'xai', 'grok-voice'),
    seed('voice_qwen', 'Qwen Voice', 'voice', 'qwen', 'cosyvoice-v2'),
    seed('voice_google', 'Google Voice', 'voice', 'google', 'gemini-tts'),
    seed('voice_bytedance', '字节语音', 'voice', 'bytedance', 'doubao-tts'),
  ],
};
