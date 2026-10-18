import { describe, expect, it } from 'vitest';
import { getModelLogoPath } from './ModelIcons';

describe('ModelIcons getModelLogoPath', () => {
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
