import { describe, expect, it } from 'vitest';
import { APPROVED_MODELS } from '@shared/domain/models/modelCatalog';
import { getModelLogoDataUri, getModelLogoPath } from './ModelIcons';

describe('ModelIcons getModelLogoPath', () => {
  it.each([
    'muse-wonder-1.0', 'muse-wonder-full-1.0', 'muse-spark-1.0',
    'muse-image', 'muse-voice-transcribe', 'muse-glimmer',
    'meta/muse-wonder-1.0', 'openai/muse-wonder-1.0', 'fal-ai/muse-image',
  ])('%s uses Meta branding even through a gateway', id => {
    expect(getModelLogoPath(id)).toBe('/logo/meta.svg');
    expect(getModelLogoDataUri(id)).toBe(getModelLogoDataUri('meta'));
    expect(getModelLogoDataUri(id, true)).toBe(getModelLogoDataUri('meta', true));
  });

  it('does not interpret fragments in route IDs as OpenAI reasoning models', () => {
    expect(getModelLogoPath('custom-o3route')).toBe('/logo/unknown.svg');
    expect(getModelLogoPath('o3-mini')).toBe('/logo/openai.svg');
    expect(getModelLogoPath('openai/o4-mini')).toBe('/logo/openai.svg');
  });

  it('resolves core and multimedia vendors correctly', () => {
    expect(getModelLogoPath('topaz-upscale')).toBe('/logo/topaz.svg');
    expect(getModelLogoPath('elevenlabs-speech')).toBe('/logo/elevenlabs.svg');
    expect(getModelLogoPath('vidu-2.0')).toBe('/logo/vidu.svg');
    expect(getModelLogoPath('runway-gen3')).toBe('/logo/runway.svg');
    expect(getModelLogoPath('pika-2')).toBe('/logo/pika.svg');
    expect(getModelLogoPath('midjourney-v7')).toBe('/logo/midjourney.svg');
    expect(getModelLogoPath('kling-v2-master')).toBe('/logo/kling.svg');
    expect(getModelLogoPath('luma-photon')).toBe('/logo/luma.svg');
    expect(getModelLogoPath('qwen-image')).toBe('/logo/qwen.svg');
    expect(getModelLogoPath('sora-2')).toBe('/logo/sora.svg');
    expect(getModelLogoPath('meshy-4')).toBe('/logo/meshy.svg');
    expect(getModelLogoPath('fal')).toBe('/logo/fal.svg');
    expect(getModelLogoPath('fal-ai')).toBe('/logo/fal.svg');
    expect(getModelLogoPath('siliconflow')).toBe('/logo/siliconflow.svg');
    expect(getModelLogoPath('groq')).toBe('/logo/groq.svg');
    expect(getModelLogoPath('cohere-command-r')).toBe('/logo/cohere.svg');
    expect(getModelLogoPath('comfly-gateway')).toBe('/logo/comfly.svg');
  });
});

const vendorLogos = {
  openai: ['openai', 'sora'], google: ['gemini'], bytedance: ['jimeng'],
  alibaba: ['qwen'], midjourney: ['midjourney'], bfl: ['flux'], kuaishou: ['kling'],
  xai: ['grok'], minimax: ['minimax'], anthropic: ['claude'], deepseek: ['deepseek'],
  moonshot: ['kimi', 'moonshot'], vidu: ['vidu'],
};
describe('catalog model logos', () => {
  it.each(APPROVED_MODELS)('$id matches its declared vendor and has light/dark assets', model => {
    expect(vendorLogos[model.vendor].map(logo => `/logo/${logo}.svg`)).toContain(getModelLogoPath(model.id));
    expect(getModelLogoDataUri(model.id)).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(getModelLogoDataUri(model.id, true)).toMatch(/^data:image\/svg\+xml;base64,/);
  });
  it.each([
    ['openai/claude-sonnet-5', 'claude'], ['fal-ai/kling-v2', 'kling'],
    ['aliyun/qwen3-max', 'qwen'], ['h3', 'minimax'], ['image2-4k', 'openai'],
    ['step-3.5-flash', 'stepfun'], ['yi-large', 'yi'], ['mjv8.1', 'midjourney'],
    ['custom-mjroute', 'unknown'], ['custom-yiroute', 'unknown'],
  ])('%s resolves to %s', (id, logo) => {
    expect(getModelLogoPath(id)).toBe(`/logo/${logo}.svg`);
  });
});

describe('unknown model branding', () => {
  it.each(['', 'other', 'community', 'unknown-model', 'default', 'swan-model',
    'custom-openai-route', 'custom-gpt-route', 'metadata-model', 'misstep-model', 'sensible-model', 'avatar-custom',
    'openai/unknown-model', 'fal-ai/unknown-model'])('%s stays neutral', id => {
    expect(getModelLogoPath(id)).toBe('/logo/unknown.svg');
    expect(getModelLogoDataUri(id)).toBe(getModelLogoDataUri('unknown'));
    expect(getModelLogoDataUri(id)).not.toBeNull();
  });
  it('keeps explicit Hugging Face branding', () => {
    expect(getModelLogoPath('huggingface')).toBe('/logo/huggingface.svg');
  });
});

describe('all bundled vendor logos', () => {
  const files = Object.keys(import.meta.glob('../../assets/model-logos/*.svg'));
  it.each(files)('%s resolves explicitly and has both theme assets', path => {
    const file = path.split('/').pop()!;
    const id = file.slice(0, -4);
    expect(getModelLogoPath(id)).toBe(`/logo/${file}`);
    expect(getModelLogoDataUri(id)).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(getModelLogoDataUri(id, true)).toMatch(/^data:image\/svg\+xml;base64,/);
  });
  it.each(APPROVED_MODELS)('$id retains its logo through gateway namespaces', model => {
    for (const prefix of ['openai/', 'fal-ai/', 'aliyun/']) {
      expect(getModelLogoPath(prefix + model.id)).toBe(getModelLogoPath(model.id));
    }
  });
  it.each([
    ['cosyvoice-v3', 'qwen'], ['qwq-32b', 'qwen'], ['seededit-3', 'jimeng'],
    ['seed-tts-2', 'jimeng'], ['omnihuman-1', 'jimeng'], ['cogvideo', 'zhipu'],
    ['stable-audio-2', 'stability'], ['command-r-plus', 'cohere'],
  ])('%s resolves to %s', (id, logo) => {
    expect(getModelLogoPath(id)).toBe(`/logo/${logo}.svg`);
  });
});
