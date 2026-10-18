import { describe, expect, it } from 'vitest';
import {
  inferVendorFromModelId,
  vendorOption,
  isModelMatchModality,
  isLegacyOrDiscontinuedModel,
  compareModelVersionsDesc,
} from './modalityMeta';
import { classifyModel, normalizeModelId } from './modalityClassifier';

describe('modalityMeta vendor inference', () => {
  it('identifies vendors accurately even when requested from image modality', () => {
    const cases = [
      { id: 'claude-fable-5', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'claude-haiku-4-5-20250929', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'claude-opus-4-7', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'claude-opus-5', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'claude-sonnet-5', expectedVendor: 'anthropic', expectedName: 'Anthropic' },
      { id: 'deepseek-v4-flash', expectedVendor: 'deepseek', expectedName: 'DeepSeek' },
      { id: 'deepseek-v4.1-flash', expectedVendor: 'deepseek', expectedName: 'DeepSeek' },
      { id: 'flux', expectedVendor: 'flux', expectedName: 'Flux' },
      { id: 'flux-pro-max', expectedVendor: 'flux', expectedName: 'Flux' },
      { id: 'kimi-k3', expectedVendor: 'moonshot', expectedName: 'Moonshot' },
      { id: 'MiniMax-H3', expectedVendor: 'minimax', expectedName: 'MiniMax' },
      { id: 'omni_flash-10s', expectedVendor: 'google', expectedName: 'Google' },
      { id: 'viduq3', expectedVendor: 'vidu', expectedName: 'Vidu' },
      { id: 'viduq3-mix', expectedVendor: 'vidu', expectedName: 'Vidu' },
      { id: 'viduq3-pro', expectedVendor: 'vidu', expectedName: 'Vidu' },
      { id: 'viduq3-turbo', expectedVendor: 'vidu', expectedName: 'Vidu' },
      { id: 'z-image-turbo', expectedVendor: 'qwen', expectedName: 'Qwen' },
      { id: 'sora-2', expectedVendor: 'openai', expectedName: 'OpenAI' },
      { id: 'sora-2-pro', expectedVendor: 'openai', expectedName: 'OpenAI' },
      { id: 'veo3.1', expectedVendor: 'google', expectedName: 'Google' },
      { id: 'veo3.1-fast', expectedVendor: 'google', expectedName: 'Google' },
      { id: 'topaz-video-upscale', expectedVendor: 'topaz', expectedName: 'Topaz 超分' },
    ];

    for (const item of cases) {
      const vendorId = inferVendorFromModelId(item.id, 'image');
      expect(vendorId).toBe(item.expectedVendor);
      const option = vendorOption('video', vendorId) || vendorOption('image', vendorId);
      expect(option?.name).toBe(item.expectedName);
    }
  });

  it('correctly matches vendors across three_d and voice', () => {
    expect(inferVendorFromModelId('meshy-4', 'three_d')).toBe('meshy');
    expect(vendorOption('three_d', 'meshy')?.name).toBe('Meshy');
    expect(inferVendorFromModelId('elevenlabs-music', 'music')).toBe('elevenlabs');
    expect(vendorOption('music', 'elevenlabs')?.name).toBe('ElevenLabs');
    expect(inferVendorFromModelId('eleven-multilingual-v2', 'voice')).toBe('elevenlabs');
    expect(vendorOption('voice', 'elevenlabs')?.name).toBe('ElevenLabs');
    expect(inferVendorFromModelId('kling-lip-sync', 'avatar')).toBe('kling');
    expect(inferVendorFromModelId('omnihuman-1.5', 'avatar')).toBe('bytedance');
    expect(inferVendorFromModelId('wanx-avatar', 'avatar')).toBe('qwen');
    expect(inferVendorFromModelId('hedra-character-3', 'avatar')).toBe('hedra');
    expect(inferVendorFromModelId('sync-lipsync-2', 'avatar')).toBe('fal');
    expect(vendorOption('avatar', 'kling')?.name).toBe('可灵');
  });

  it('correctly matches image modality for flux and z-image', () => {
    expect(isModelMatchModality('flux', 'image')).toBe(true);
    expect(isModelMatchModality('flux-pro-max', 'image')).toBe(true);
    expect(isModelMatchModality('z-image-turbo', 'image')).toBe(true);
    expect(isModelMatchModality('gpt-image-2', 'image')).toBe(true);
    expect(isModelMatchModality('dall-e-3', 'image')).toBe(true);
    expect(isModelMatchModality('midjourney', 'image')).toBe(true);
    expect(isModelMatchModality('seedream-3.0', 'image')).toBe(true);
    expect(isModelMatchModality('imagen-3.0-generate', 'image')).toBe(true);
    expect(isModelMatchModality('kolors', 'image')).toBe(true);
    expect(isModelMatchModality('kling-image', 'image')).toBe(true);
    expect(isModelMatchModality('sdxl-turbo', 'image')).toBe(true);

    // 排除非绘图模型
    expect(isModelMatchModality('claude-opus-5', 'image')).toBe(false);
    expect(isModelMatchModality('gpt-4o', 'image')).toBe(false);
    expect(isModelMatchModality('gpt-5.6-luna', 'image')).toBe(false);
    expect(isModelMatchModality('sora-2', 'image')).toBe(false);
    expect(isModelMatchModality('kling-v2-master', 'image')).toBe(false);
    expect(isModelMatchModality('doubao-seedance-2.5', 'image')).toBe(false);
    expect(isModelMatchModality('cosyvoice-v2', 'image')).toBe(false);
    expect(isModelMatchModality('gpt-5.3-codex', 'image')).toBe(false);
  });

  it('correctly matches multimodal (chat) modality and rejects code/legacy/embedding models', () => {
    // 应该匹配的主流多模态与视觉对话模型
    expect(isModelMatchModality('gpt-4o', 'chat')).toBe(true);
    expect(isModelMatchModality('gpt-4o-mini', 'chat')).toBe(true);
    expect(isModelMatchModality('gpt-5.6-luna', 'chat')).toBe(true);
    expect(isModelMatchModality('gpt-5.6-sol', 'chat')).toBe(true);
    expect(isModelMatchModality('gpt-6-luna', 'chat')).toBe(true);
    expect(isModelMatchModality('gpt-6.1-sol', 'chat')).toBe(true);
    expect(isModelMatchModality('gemini-1.5-pro', 'chat')).toBe(true);
    expect(isModelMatchModality('gemini-2.5-flash', 'chat')).toBe(true);
    expect(isModelMatchModality('claude-3-7-sonnet-20250219', 'chat')).toBe(true);
    expect(isModelMatchModality('claude-opus-5', 'chat')).toBe(true);
    expect(isModelMatchModality('qwen-vl-max', 'chat')).toBe(true);
    expect(isModelMatchModality('qwen2.5-vl', 'chat')).toBe(true);
    expect(isModelMatchModality('doubao-pro-vision-32k', 'chat')).toBe(true);
    expect(isModelMatchModality('glm-4v', 'chat')).toBe(true);
    expect(isModelMatchModality('deepseek-chat', 'chat')).toBe(true);
    expect(isModelMatchModality('deepseek-v3', 'chat')).toBe(true);
    expect(isModelMatchModality('deepseek-r1', 'chat')).toBe(true);
    expect(isModelMatchModality('deepseek-reasoner', 'chat')).toBe(true);
    expect(isModelMatchModality('claude-5.1-fable', 'chat')).toBe(true);
    expect(isModelMatchModality('claude-5.5', 'chat')).toBe(true);
    expect(isModelMatchModality('qwen-max', 'chat')).toBe(true);
    expect(isModelMatchModality('doubao-pro-32k', 'chat')).toBe(true);
    expect(isModelMatchModality('kimi-k2', 'chat')).toBe(true);
    expect(isModelMatchModality('mimo-v2-flash', 'chat')).toBe(true);
    expect(isModelMatchModality('xiaomi-mimo-pro', 'chat')).toBe(true);
    expect(isModelMatchModality('yi-lightning', 'chat')).toBe(true);
    expect(isModelMatchModality('ernie-4.0', 'chat')).toBe(true);
    expect(isModelMatchModality('baichuan-4', 'chat')).toBe(true);
    expect(isModelMatchModality('step-1v', 'chat')).toBe(true);

    // 应该被淘汰的初代与停运模型
    expect(isModelMatchModality('gpt-3.5-turbo', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-4-0613', 'chat')).toBe(false);
    expect(isModelMatchModality('claude-2.0', 'chat')).toBe(false);
    expect(isModelMatchModality('claude-instant-1.2', 'chat')).toBe(false);
    expect(isModelMatchModality('gemini-1.0-pro', 'chat')).toBe(false);
    expect(isModelMatchModality('dall-e-2', 'image')).toBe(false);
    expect(isLegacyOrDiscontinuedModel('gpt-3.5-turbo')).toBe(true);
    expect(isLegacyOrDiscontinuedModel('claude-1.3')).toBe(true);
    expect(isLegacyOrDiscontinuedModel('dall-e-2')).toBe(true);

    // 应该严格排除的代码专用模型
    expect(isModelMatchModality('gpt-5.3-codex', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-5.3-codex-high', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-5-codex-medium', 'chat')).toBe(false);
    expect(isModelMatchModality('deepseek-coder', 'chat')).toBe(false);

    // 应该严格排除的旧单模态/网络中继/开源小模型/搜索实验特化
    expect(isModelMatchModality('net-gpt-3.5-turbo', 'chat')).toBe(false);
    expect(isModelMatchModality('net-gpt-4', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-oss-120b', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-4o-search-preview', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-4o-mini-search-preview', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-5-search-api', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-4o-study', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-5-minimal', 'chat')).toBe(false);

    // 应该严格排除的向量/辅助模型
    expect(isModelMatchModality('text-embedding-3-small', 'chat')).toBe(false);
    expect(isModelMatchModality('bge-m3', 'chat')).toBe(false);

    // 应该严格排除的生图/视频/语音模型
    expect(isModelMatchModality('flux-pro', 'chat')).toBe(false);
    expect(isModelMatchModality('midjourney', 'chat')).toBe(false);
    expect(isModelMatchModality('sora-2', 'chat')).toBe(false);
    expect(isModelMatchModality('cosyvoice-v2', 'chat')).toBe(false);
    expect(isModelMatchModality('suno', 'chat')).toBe(false);
    expect(isModelMatchModality('hunyuan-3d', 'chat')).toBe(false);
  });

  it('correctly matches video, voice, and 3D modalities', () => {
    // 视频 (含 MiniMax H3 / Hailuo / I2V / T2V / LivePortrait / 万相 / CogVideoX / Runway 等)
    expect(isModelMatchModality('sora-2', 'video')).toBe(true);
    expect(isModelMatchModality('veo-3.1', 'video')).toBe(true);
    expect(isModelMatchModality('doubao-seedance-2.5', 'video')).toBe(true);
    expect(isModelMatchModality('kling-v2-master', 'video')).toBe(true);
    expect(isModelMatchModality('kling-v1.5', 'video')).toBe(true);
    expect(isModelMatchModality('runway-gen-3', 'video')).toBe(true);
    expect(isModelMatchModality('MiniMax-H3', 'video')).toBe(true);
    expect(isModelMatchModality('MiniMax-Hailuo-02', 'video')).toBe(true);
    expect(isModelMatchModality('I2V-01', 'video')).toBe(true);
    expect(isModelMatchModality('T2V-01', 'video')).toBe(true);
    expect(isModelMatchModality('wan2.1-t2v-14b', 'video')).toBe(true);
    expect(isModelMatchModality('wan2.1-i2v-720p', 'video')).toBe(true);
    expect(isModelMatchModality('cogvideox-5b', 'video')).toBe(true);
    expect(isModelMatchModality('vidu-pro', 'video')).toBe(true);
    expect(isModelMatchModality('liveportrait', 'video')).toBe(true);
    expect(isModelMatchModality('kling-image', 'video')).toBe(false);
    expect(isModelMatchModality('kolors', 'video')).toBe(false);
    expect(isModelMatchModality('flux-pro', 'video')).toBe(false);
    expect(isModelMatchModality('gpt-4o', 'video')).toBe(false);

    // 严格互斥：视频模型绝不能被误判为多模态推理模型 (chat) 或绘图
    expect(isModelMatchModality('MiniMax-H3', 'chat')).toBe(false);
    expect(isModelMatchModality('MiniMax-Hailuo-02', 'chat')).toBe(false);
    expect(isModelMatchModality('I2V-01', 'chat')).toBe(false);
    expect(isModelMatchModality('T2V-01', 'chat')).toBe(false);
    expect(isModelMatchModality('wan2.1-t2v-14b', 'chat')).toBe(false);
    expect(isModelMatchModality('wan2.1-t2v-14b', 'image')).toBe(false);

    // 语音 TTS 专指文本转语音与克隆（CosyVoice, MiniMax Speech/T2A, Seed-TTS, ElevenLabs, OpenAI TTS）
    expect(isModelMatchModality('cosyvoice-v2', 'voice')).toBe(true);
    expect(isModelMatchModality('speech-01', 'voice')).toBe(true);
    expect(isModelMatchModality('speech-2.8-hd', 'voice')).toBe(true);
    expect(isModelMatchModality('doubao-tts', 'voice')).toBe(true);
    expect(isModelMatchModality('seed-tts-pro', 'voice')).toBe(true);
    expect(isModelMatchModality('eleven-multilingual-v2', 'voice')).toBe(true);
    expect(isModelMatchModality('tts-1-hd', 'voice')).toBe(true);
    expect(isModelMatchModality('MiniMax-M2.5', 'chat')).toBe(true);
    expect(isModelMatchModality('MiniMax-M2.5', 'voice')).toBe(false);

    // 语音转文字 ASR（听写识别）绝不能被误划为语音合成 TTS
    expect(isModelMatchModality('whisper-1', 'voice')).toBe(false);
    expect(isModelMatchModality('whisper-large-v3', 'voice')).toBe(false);
    expect(isModelMatchModality('sensevoice-v1', 'voice')).toBe(false);
    expect(isModelMatchModality('paraformer-v2', 'voice')).toBe(false);

    // 多模态语音交互对话属于 chat，绝不属于 voice TTS
    expect(isModelMatchModality('qwen-audio-chat', 'chat')).toBe(true);
    expect(isModelMatchModality('qwen-audio-chat', 'voice')).toBe(false);
    expect(isModelMatchModality('gpt-4o-audio-preview', 'chat')).toBe(true);
    expect(isModelMatchModality('gpt-4o-audio-preview', 'voice')).toBe(false);

    // 音乐与音效 (含 Suno, Udio, MiniMax Music, Stable Audio)
    expect(isModelMatchModality('chirp-v3-0', 'music')).toBe(true);
    expect(isModelMatchModality('suno-v3.5', 'music')).toBe(true);
    expect(isModelMatchModality('music-01', 'music')).toBe(true);
    expect(isModelMatchModality('stable-audio', 'music')).toBe(true);
    expect(isModelMatchModality('chirp-v3-0', 'chat')).toBe(false);
    expect(isModelMatchModality('suno', 'voice')).toBe(false);
    expect(isModelMatchModality('stable-audio', 'voice')).toBe(false);

    // MiniMax 语言多模态仅限 abab 系列
    expect(isModelMatchModality('abab6.5s-chat', 'chat')).toBe(true);
    expect(isModelMatchModality('abab6.5s-chat', 'video')).toBe(false);

    // 3D
    expect(isModelMatchModality('fal-ai/hunyuan-3d/v3.1/pro', 'three_d')).toBe(true);
    expect(isModelMatchModality('tripo', 'three_d')).toBe(true);
    expect(isModelMatchModality('flux', 'three_d')).toBe(false);
  });

  it('correctly matches mainstream image models including SD-3.5 and Wanx', () => {
    expect(isModelMatchModality('sd-3.5-large', 'image')).toBe(true);
    expect(isModelMatchModality('flux-1.1-pro', 'image')).toBe(true);
    expect(isModelMatchModality('recraft-v3', 'image')).toBe(true);
    expect(isModelMatchModality('ideogram-v2', 'image')).toBe(true);
    expect(isModelMatchModality('wanx2.1-t2i', 'image')).toBe(true);
    expect(isModelMatchModality('jimeng-2.1', 'image')).toBe(true);
  });

  it('correctly recognizes modern reasoning models in multimodal chat', () => {
    expect(isModelMatchModality('o1-preview', 'chat')).toBe(true);
    expect(isModelMatchModality('o3-mini', 'chat')).toBe(true);
    expect(isModelMatchModality('qwq-32b', 'chat')).toBe(true);
    expect(isModelMatchModality('gemini-2.0-flash', 'chat')).toBe(true);
  });

  it('accurately orders model versions from newest to oldest', () => {
    // OpenAI 排序：从 6.1 -> 6 -> 5.6 -> 5.5 -> 5.4 -> 5.2 -> 5.1 -> 5 -> 4o
    const openaiModels = [
      'gpt-5.4-pro',
      'gpt-5.5',
      'gpt-5.6-luna',
      'gpt-5.6-sol-2026-07-09',
      'gpt-6-luna',
      'gpt-6.1-sol',
      'gpt-4o-all',
      'gpt-5-all',
      'gpt-5.2-all',
    ];
    const sortedOpenAI = [...openaiModels].sort(compareModelVersionsDesc);
    expect(sortedOpenAI[0]).toBe('gpt-6.1-sol');
    expect(sortedOpenAI[1]).toBe('gpt-6-luna');
    expect(sortedOpenAI[2]).toBe('gpt-5.6-sol-2026-07-09');
    expect(sortedOpenAI[3]).toBe('gpt-5.6-luna');
    expect(sortedOpenAI[sortedOpenAI.length - 1]).toBe('gpt-4o-all');

    // Google 排序：从 3.7 -> 3.5 -> 3.1 -> 3.0 -> 2.5
    const googleModels = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3.1-pro-preview',
      'gemini-3.7-flash',
      'gemini-3.5-flash',
    ];
    const sortedGoogle = [...googleModels].sort(compareModelVersionsDesc);
    expect(sortedGoogle[0]).toBe('gemini-3.7-flash');
    expect(sortedGoogle[1]).toBe('gemini-3.5-flash');
    expect(sortedGoogle[2]).toBe('gemini-3.1-pro-preview');
    expect(sortedGoogle[3]).toBe('gemini-2.5-pro');
    expect(sortedGoogle[4]).toBe('gemini-2.5-flash');

    // Claude 排序：3.7 -> 3.5 -> 3.0
    const claudeModels = [
      'claude-3-opus-20240229',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
    ];
    const sortedClaude = [...claudeModels].sort(compareModelVersionsDesc);
    expect(sortedClaude[0]).toBe('claude-3-7-sonnet-20250219');
    expect(sortedClaude[1]).toBe('claude-3-5-sonnet-20241022');
    expect(sortedClaude[2]).toBe('claude-3-opus-20240229');

    // Qwen 排序：2.5 -> 2 -> 1
    const qwenModels = ['qwen-vl-max', 'qwen2-vl-72b', 'qwen2.5-vl-72b-instruct'];
    const sortedQwen = [...qwenModels].sort(compareModelVersionsDesc);
    expect(sortedQwen[0]).toBe('qwen2.5-vl-72b-instruct');
    expect(sortedQwen[1]).toBe('qwen2-vl-72b');
    expect(sortedQwen[2]).toBe('qwen-vl-max');

    // 生图排序：新代次优先
    const imageModels = ['seedream-2.0', 'seedream-3.0', 'flux-pro', 'flux-1.1-pro'];
    const sortedImage = [...imageModels].sort(compareModelVersionsDesc);
    expect(sortedImage.indexOf('seedream-3.0') < sortedImage.indexOf('seedream-2.0')).toBe(true);
    expect(sortedImage.indexOf('flux-1.1-pro') < sortedImage.indexOf('flux-pro')).toBe(true);
  });

  it('keeps generation, realtime, and recognition models in the right modality', () => {
    expect(isModelMatchModality('omni_flash-10s', 'video')).toBe(true);
    expect(isModelMatchModality('omni_flash-10s', 'chat')).toBe(false);
    expect(isModelMatchModality('omni-flash-image', 'image')).toBe(true);
    expect(isModelMatchModality('omni-flash-image', 'video')).toBe(false);

    expect(isModelMatchModality('gpt-4o-transcribe', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-4o-transcribe', 'voice')).toBe(false);
    expect(isModelMatchModality('gpt-4o-realtime-preview', 'chat')).toBe(false);
    expect(isModelMatchModality('gemini-2.5-flash-native-audio', 'chat')).toBe(false);
    expect(isModelMatchModality('o3-deep-research', 'chat')).toBe(false);
    expect(isModelMatchModality('gpt-4o-audio-preview', 'chat')).toBe(true);

    expect(isModelMatchModality('doubao-seededit-3-0-i2i', 'image')).toBe(true);
    expect(isModelMatchModality('doubao-seededit-3-0-i2i', 'chat')).toBe(false);
    expect(isModelMatchModality('kling-virtual-try-on', 'image')).toBe(true);
    expect(isModelMatchModality('kling-virtual-try-on', 'video')).toBe(false);

    expect(isModelMatchModality('gpt-4.1', 'chat')).toBe(true);
    expect(isModelMatchModality('chatgpt-4o-latest', 'chat')).toBe(true);
    expect(isModelMatchModality('deepseek-v4-flash', 'chat')).toBe(true);
    expect(isModelMatchModality('doubao-1-5-pro-32k', 'chat')).toBe(true);
    expect(isModelMatchModality('hunyuan-turbos-latest', 'chat')).toBe(true);
    expect(isModelMatchModality('MiniMax-Text-01', 'chat')).toBe(true);
    expect(isModelMatchModality('llama-4-maverick', 'chat')).toBe(true);
    expect(isModelMatchModality('mistral-medium-2508', 'chat')).toBe(true);

    expect(isModelMatchModality('wan2.5-t2i-preview', 'image')).toBe(true);
    expect(isModelMatchModality('wan2.5-t2i-preview', 'video')).toBe(false);
    expect(isModelMatchModality('seededit-3.0', 'image')).toBe(true);

    expect(isModelMatchModality('ray-2', 'video')).toBe(true);
    expect(isModelMatchModality('aleph', 'video')).toBe(true);
    expect(isModelMatchModality('omnihuman-1.5', 'avatar')).toBe(true);
    expect(isModelMatchModality('omnihuman-1.5', 'video')).toBe(false);
    expect(isModelMatchModality('sync-lipsync-2', 'avatar')).toBe(true);
    expect(isModelMatchModality('sync-lipsync-2', 'video')).toBe(false);
    expect(isModelMatchModality('kling-lip-sync', 'avatar')).toBe(true);
    expect(isModelMatchModality('kling-v2-master', 'video')).toBe(true);
    expect(isModelMatchModality('heygen-avatar', 'video')).toBe(true);
    expect(isModelMatchModality('latentsync', 'avatar')).toBe(true);
    expect(isModelMatchModality('wan2.2-animate-move', 'video')).toBe(true);
    expect(isModelMatchModality('vace-14b', 'video')).toBe(true);

    expect(isModelMatchModality('eleven_v3', 'voice')).toBe(true);
    expect(isModelMatchModality('eleven_multilingual_v2', 'voice')).toBe(true);
    expect(isModelMatchModality('fish-audio-s1', 'voice')).toBe(true);
    expect(isModelMatchModality('eleven_v3', 'music')).toBe(false);
    expect(isModelMatchModality('speech-02-hd', 'voice')).toBe(true);

    expect(isModelMatchModality('fal-ai/flux-pro/kontext', 'image')).toBe(true);
    expect(isModelMatchModality('anthropic/claude-opus-4-6', 'chat')).toBe(true);
    expect(isModelMatchModality('net-gpt-4o', 'chat')).toBe(true);
    expect(isModelMatchModality('openai/gpt-image-2', 'image')).toBe(true);
    expect(classifyModel('fal-ai/flux-pro/kontext')).toBe(classifyModel('flux-pro-kontext'));
    expect(normalizeModelId('vendor/claude-sonnet-5[plus]')).toBe('vendor-claude-sonnet-5');
    expect(isModelMatchModality('llama-3.3-70b-instruct', 'chat')).toBe(true);
    expect(isModelMatchModality('phi-4', 'chat')).toBe(true);
    expect(isModelMatchModality('command-r-plus', 'chat')).toBe(true);
    expect(isModelMatchModality('jamba-large', 'chat')).toBe(true);
    expect(isModelMatchModality('nova-pro', 'chat')).toBe(true);
    expect(isModelMatchModality('mistral-nemo', 'chat')).toBe(true);
    expect(isModelMatchModality('spark-4.0-ultra', 'chat')).toBe(true);
    expect(isModelMatchModality('sonar-pro', 'chat')).toBe(true);
    expect(isModelMatchModality('playground-v2.5-aesthetic', 'image')).toBe(true);
    expect(isModelMatchModality('codestral-latest', 'chat')).toBe(false);
    expect(isModelMatchModality('qwen3-coder-plus', 'chat')).toBe(false);
  });

  it('correctly normalizes vendors by stripping platform wrappers like fal-ai', () => {
    expect(inferVendorFromModelId('fal-ai/hunyuan-video', 'video')).toBe('hunyuan');
    expect(inferVendorFromModelId('wan2.1-t2v-14b', 'video')).toBe('qwen');
    expect(inferVendorFromModelId('speech-01-hd', 'voice')).toBe('minimax');
    expect(inferVendorFromModelId('stable-audio', 'music')).toBe('stability');
  });
});
