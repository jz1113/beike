import { describe, expect, it } from 'vitest';
import {
  inferVendorFromModelId,
  vendorOption,
  isModelMatchModality,
  isModalitySyncCandidate,
  videoSyncCandidateKey,
  modalitySyncCandidateKey,
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

  it('matches voice vendors and keeps retired modalities out of voice', () => {
    expect(inferVendorFromModelId('eleven-multilingual-v2', 'voice')).toBe('elevenlabs');
    expect(vendorOption('voice', 'elevenlabs')?.name).toBe('ElevenLabs');
    expect(isModelMatchModality('elevenlabs-music', 'voice')).toBe(false);
    expect(isModelMatchModality('kling-lip-sync', 'voice')).toBe(false);
    expect(isModelMatchModality('omnihuman-1.5', 'video')).toBe(false);
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

    expect(isModelMatchModality('chirp-v3-0', 'chat')).toBe(false);
    expect(isModelMatchModality('chirp-v3-0', 'voice')).toBe(false);
    expect(isModelMatchModality('suno-v3.5', 'voice')).toBe(false);
    expect(isModelMatchModality('suno', 'voice')).toBe(false);
    expect(isModelMatchModality('music-01', 'voice')).toBe(false);
    expect(isModelMatchModality('stable-audio', 'voice')).toBe(false);
    expect(classifyModel('suno-v3.5')).toBe('music');
    expect(classifyModel('fal-ai/hunyuan-3d/v3.1/pro')).toBe('three_d');
    expect(classifyModel('omnihuman-1.5')).toBe('avatar');

    // MiniMax 语言多模态仅限 abab 系列
    expect(isModelMatchModality('abab6.5s-chat', 'chat')).toBe(true);
    expect(isModelMatchModality('abab6.5s-chat', 'video')).toBe(false);

    expect(isModelMatchModality('fal-ai/hunyuan-3d/v3.1/pro', 'image')).toBe(false);
    expect(isModelMatchModality('fal-ai/hunyuan-3d/v3.1/pro', 'video')).toBe(false);
    expect(isModelMatchModality('tripo', 'image')).toBe(false);
    expect(isModelMatchModality('flux', 'image')).toBe(true);
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
    expect(isModelMatchModality('omnihuman-1.5', 'video')).toBe(false);
    expect(isModelMatchModality('sync-lipsync-2', 'video')).toBe(false);
    expect(isModelMatchModality('kling-lip-sync', 'video')).toBe(false);
    expect(isModelMatchModality('kling-v2-master', 'video')).toBe(true);
    expect(isModelMatchModality('heygen-avatar', 'video')).toBe(true);
    expect(isModelMatchModality('latentsync', 'video')).toBe(false);
    expect(classifyModel('latentsync')).toBe('avatar');
    expect(isModelMatchModality('wan2.2-animate-move', 'video')).toBe(true);
    expect(isModelMatchModality('vace-14b', 'video')).toBe(true);

    expect(isModelMatchModality('eleven_v3', 'voice')).toBe(true);
    expect(isModelMatchModality('eleven_multilingual_v2', 'voice')).toBe(true);
    expect(isModelMatchModality('fish-audio-s1', 'voice')).toBe(true);
    expect(isModelMatchModality('eleven_v3', 'video')).toBe(false);
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
    expect(isModelMatchModality('stable-audio', 'voice')).toBe(false);
  });
});

describe('multimodal sync catalog', () => {
  it.each([
    ['gemini-3.8-flash', 'gemini-3.7-flash'],
    ['gemini-3.8-flash', 'gemini-3.7-flash-thinking-low'],
    ['gemini-3.8-flash', 'gemini-3.7-flash-thinking-medium'],
    ['gemini-3.8-flash', 'gemini-3.7-flash-thinking-high'],
    ['gemini-3.8-flash', 'gemini-3.8-flash-thinking-low'],
    ['gemini-3.8-flash', 'gemini-3.8-flash-thinking-medium'],
    ['gemini-3.8-flash', 'gemini-3.8-flash-thinking-high'],
    ['gemini-4-argon', 'gemini-2.5-pro'],
    ['gemini-4-argon', 'gemini-4-argon-thinking-low'],
    ['gemini-4-argon', 'net-gemini-4-argon-thinking-medium'],
    ['gemini-4-argon', 'google/gemini-4-argon-thinking-high'],
    ['gpt-5.6', 'gpt-5.5'],
    ['net-gpt-6.1-sol', 'o4-mini'],
    ['anthropic/claude-opus-4-8-20261001', 'claude-opus-4-7'],
    ['claude-opus-5-5', 'claude-opus-5-5-thinking'],
    ['claude-sonnet-5-5', 'net-claude-sonnet-5-5-thinking'],
    ['claude-haiku-5-5', 'anthropic/claude-haiku-5-5-thinking'],
    ['claude-opus-4-8', 'claude-opus-4-8-20261001-thinking'],
    ['grok-4.7', 'grok-4.6'],
    ['deepseek-v4.1-flash', 'deepseek-v4-flash'],
    ['kimi-k3.1-pro', 'kimi-k3'],
    ['claude-fable-5-1', 'qwen3.8-max'],
    ['doubao-seed-2-0-pro-261001', 'doubao-seed-1-8'],
    ['glm-5.3-flash', 'MiniMax-M2.7-highspeed'],
    ['glm-5.3', 'glm-5.2'],
    ['mimo-v2.6', 'mistral-medium'],
    ['mimo-v2.6-pro-ultraspeed', 'mimo-v2.5-tts'],
    ['xiaomi-mimo-pro', 'hunyuan-t1'],
    ['gpt-6.1-terra', 'llama-3.2-vision'],
    ['gpt-6-sol', 'gemini-3.8-image-preview'],
  ])('includes %s and excludes %s', (included, excluded) => {
    expect(isModalitySyncCandidate(included, 'chat')).toBe(true);
    expect(isModalitySyncCandidate(excluded, 'chat')).toBe(false);

  });
});

describe('image sync catalog', () => {
  it.each([
    ['gemini-3.1-flash-image', 'gemini-3.1-pro-image'],
    ['gemini-3.1-flash-image-preview', 'gemini-3.1-flash-lite-image'],
    ['nano-banana-2', 'nano-banana-pro'],
    ['nano-banana-2', 'nano-banana-2-2k'],
    ['nano-banana-2', 'nano-banana-2-4k'],
    ['gemini-nano-banana-2.1', 'gemini-nano-banana-2.5'],
    ['nano-banana-2.1', 'google/nano-banana-2.1-2k'],
    ['nano-banana-2.1', 'nano-banana-2.1-4k'],
    ['gpt-image-2', 'gpt-image-1.5'],
    ['gpt-image-2.5-sunburst', 'gpt-image-2.50'],
    ['gpt-image-2.6', 'gpt-image-2.7'],
    ['grok-4.2-image', 'grok-4.2'],
    ['doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828'],
    ['doubao-seedream-5-0-260128', 'seedream-5.1'],
    ['seedream-v5-pro', 'seedream-v5-pro-layer-decomposition'],
    ['seedream-5-flash', 'seedream-4.0'],
    ['gpt-image-2.6-sunburst', 'kling-image-v3-omni'],
    ['gpt-image-2-4k', 'kling-image-v3'],
  ])('includes %s and excludes %s', (included, excluded) => {
    expect(isModalitySyncCandidate(included, 'image')).toBe(true);
    expect(isModalitySyncCandidate(excluded, 'image')).toBe(false);
  });
});

describe('video sync catalog', () => {
  it.each([
    ['veo-3.1-generate-001', 'veo3.1'],
    ['veo-3.1-fast-generate-001', 'veo3.1-fast'],
    ['doubao-seedance-2-5-260628', 'doubao-seedance-2.5'],
  ])('recognizes %s as a channel alias of %s', (alias, standard) => {
    expect(isModalitySyncCandidate(alias, 'video')).toBe(true);
    expect(videoSyncCandidateKey(alias)).toBe(videoSyncCandidateKey(standard));
  });

  it.each([
    ['wan3.0-video', 'wan3.0-video-prime'],
    ['veo3.1', 'veo3.1-fast', 'veo3.1-pro'],
    ['doubao-seedance-2-0-260128', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2.0-mini'],
    ['kling-4.0', 'kling-4.0-flash'],
    ['sora-2', 'sora-2-pro'],
    ['gemini-omni-1.0-flash', 'gemini-omni-1.2-flash', 'viduq4-preview'],
  ].map((ids) => [ids]))('keeps distinct video specs %j', (ids) => {
    expect(ids.every((id) => isModalitySyncCandidate(id, 'video'))).toBe(true);
    expect(new Set(ids.map(videoSyncCandidateKey)).size).toBe(ids.length);
  });

  it('deduplicates gateway aliases while keeping different specs separate', () => {
    expect(videoSyncCandidateKey('google/gemini-omni-1.1-flash')).toBe(videoSyncCandidateKey('omni_flash-10s'));
    expect(videoSyncCandidateKey('net-vidu-q4-preview')).toBe(videoSyncCandidateKey('viduq4-preview'));
    expect(videoSyncCandidateKey('kling-video-v3')).not.toBe(videoSyncCandidateKey('kling-video-v3-omni'));
  });

  it.each([
    ['kling-4.0-flash', 'kling-video-v3-omni'],
    ['doubao-seedance-2-0-260128', 'doubao-seedance-1.5'],
    ['veo3.1-fast', 'veo-2'],
    ['veo3.1-pro', 'veo3.1-pro-4k'],
    ['veo3.1-pro', 'veo3.1-components'],
    ['wan3.0-video-prime', 'wan2.7-video'],
    ['viduq4-preview', 'viduq3-pro'],
    ['gemini-omni-1.0-flash', 'omni_flash-10s'],
    ['gemini-omni-1.2-flash', 'google/gemini-omni-1.1-flash'],
    ['net-vidu-q4-preview', 'flux-pro'],
  ])('includes %s and excludes %s', (included, excluded) => {
    expect(isModalitySyncCandidate(included, 'video')).toBe(true);
    expect(isModalitySyncCandidate(excluded, 'video')).toBe(false);
  });
});

describe('voice sync catalog', () => {
  it.each([
    ['speech-2.8-hd', 'speech-2.6-hd'],
    ['minimax-speech-2.8-turbo', 'speech-02-hd'],
    ['cosyvoice-v3', 'cosyvoice-v2'],
    ['eleven_v3', 'eleven_multilingual_v2'],
    ['eleven_flash_v2_5', 'eleven_flash_v2'],
    ['gpt-4o-mini-tts', 'tts-1-hd'],
    ['doubao-tts', 'whisper-1'],
    ['grok-voice', 'grok-imagine-video-1.5'],
  ])('includes %s and excludes %s', (included, excluded) => {
    expect(isModalitySyncCandidate(included, 'voice')).toBe(true);
    expect(isModalitySyncCandidate(excluded, 'voice')).toBe(false);
  });

  it('deduplicates aliases without merging separate voice tiers', () => {
    expect(modalitySyncCandidateKey('minimax/speech-2.8-hd', 'voice')).toBe(modalitySyncCandidateKey('minimax-speech-2-8-hd', 'voice'));
    expect(modalitySyncCandidateKey('elevenlabs-v3', 'voice')).toBe(modalitySyncCandidateKey('eleven_v3', 'voice'));
    expect(modalitySyncCandidateKey('speech-2.8-hd', 'voice')).not.toBe(modalitySyncCandidateKey('speech-2.8-turbo', 'voice'));
  });
});
