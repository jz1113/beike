import { expect, it } from 'vitest';
import { sortStudioModels } from './studioModelSorting';

it('groups manufacturers and sorts mixed video version formats newest first', () => {
  const ids = [
    'doubao-seedance-1-0-pro-250528', 'kling-video-v2-5-turbo',
    'doubao-seedance-1-5-pro-251215', 'viduq3',
    'doubao-seedance-2-0-fast-260128', 'kling-video-v3',
    'doubao-seedance-2.5', 'vidu-q4-preview', 'kling-video-v2-6',
    'doubao-seedance-2.0-mini',
  ];
  const models = ids.map((modelId, index) => ({ id: `route-${index}`, modelId }));
  expect(sortStudioModels(models).map(model => model.modelId)).toEqual([
    'doubao-seedance-2.5', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2.0-mini',
    'doubao-seedance-1-5-pro-251215', 'doubao-seedance-1-0-pro-250528',
    'kling-video-v3', 'kling-video-v2-6', 'kling-video-v2-5-turbo',
    'vidu-q4-preview', 'viduq3',
  ]);
  expect(models.map(model => model.modelId)).toEqual(ids);
});

it('keeps equivalent versions and duplicate routes stable and ignores duration suffixes', () => {
  const models = [
    { modelId: 'omni_flash-10s', id: 'omni' },
    { modelId: 'veo3.1', id: 'veo' },
    { modelId: 'MiniMax-H3', id: 'metaso' },
    { modelId: 'MiniMax-H3', id: 'official' },
    { modelId: 'wan2.6-video', id: 'wan-old' },
    { modelId: 'wan3.0-video', id: 'wan-new' },
  ];
  expect(sortStudioModels(models).map(model => model.id)).toEqual([
    'veo', 'omni', 'metaso', 'official', 'wan-new', 'wan-old',
  ]);
});

it('groups image manufacturers and orders generations without treating snapshots as versions', () => {
  const models = [
    'doubao-seedream-4-0-250828', 'gpt-image-2', 'gemini-2.5-flash-image',
    'doubao-seedream-5-0-260128', 'gpt-image-2.5-flare', 'gemini-3.1-flash-image',
    'doubao-seedream-4-5-251128', 'openai/gpt-image-2', 'gemini-3-pro-image',
  ].map(modelId => ({ modelId }));
  expect(sortStudioModels(models).map(model => model.modelId)).toEqual([
    'doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828',
    'gpt-image-2.5-flare', 'gpt-image-2', 'openai/gpt-image-2',
    'gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-2.5-flash-image',
  ]);
});

it('groups text models and compares generations before tiers or snapshot dates', () => {
  const models = [
    'gpt-5.6-sol', 'claude-opus-4-5-20251101-thinking', 'gemini-3.7-pro',
    'gpt-6.1-luna', 'claude-sonnet-5', 'gemini-3.8-flash',
    'gpt-6-sol', 'claude-opus-4-6',
  ].map(modelId => ({ modelId }));
  expect(sortStudioModels(models).map(model => model.modelId)).toEqual([
    'gpt-6.1-luna', 'gpt-6-sol', 'gpt-5.6-sol',
    'claude-sonnet-5', 'claude-opus-4-6', 'claude-opus-4-5-20251101-thinking',
    'gemini-3.8-flash', 'gemini-3.7-pro',
  ]);
});

it('groups audio manufacturers and sorts speech, voice and TTS versions newest first', () => {
  const models = [
    'speech-2.6-hd', 'tts-1-hd', 'cosyvoice-v2', 'eleven_multilingual_v2',
    'speech-2.8-turbo', 'gpt-4o-mini-tts', 'cosyvoice-v3', 'eleven_v3', 'speech-02-hd',
  ].map(modelId => ({ modelId }));
  expect(sortStudioModels(models).map(model => model.modelId)).toEqual([
    'speech-2.8-turbo', 'speech-2.6-hd', 'speech-02-hd',
    'gpt-4o-mini-tts', 'tts-1-hd', 'cosyvoice-v3', 'cosyvoice-v2',
    'eleven_v3', 'eleven_multilingual_v2',
  ]);
});
