import { describe, expect, it } from 'vitest';
import { buildVideoRequest } from '../index';

const images = ['https://cdn.example/product.png'];
const audios = ['https://cdn.example/voice-one.mp3', 'https://cdn.example/voice-two.mp3'];
const base = { prompt: '商品参考图1，场景按场景图，音色参考音频1、音频2。', refMode: 'omni', images, audios, duration: 5, resolution: '720P' };

describe('multimodal video adapters retain ordered voice references', () => {
  it.each(['doubao-seedance-2.0-mini', 'doubao-seedance-2-0-260128', 'doubao-seedance-2.5'])('%s carries audio URLs with reference roles', (model) => {
    const { payload } = buildVideoRequest({ ...base, model });
    const content = payload.content as Array<{ type: string; audio_url?: { url: string }; role?: string }>;
    expect(content.filter(item => item.type === 'audio_url')).toEqual(audios.map(url => ({
      type: 'audio_url', audio_url: { url }, role: 'reference_audio',
    })));
    expect(content.filter(item => item.type === 'image_url').map(item => item.role)).toEqual(['reference_image']);
  });

  it('Wan carries images and independent audio numbering in input.media', () => {
    const { payload } = buildVideoRequest({ ...base, model: 'wan3.0-video' });
    expect((payload.input as { media: unknown[] }).media).toEqual([
      { type: 'reference_image', url: images[0] }, ...audios.map(url => ({ type: 'reference_audio', url })),
    ]);
  });

  it.each([-1, 0, 42, 2147483647])('Wan retains the explicit seed %s', (seed) => {
    const { payload } = buildVideoRequest({ ...base, model: 'wan3.0-video', seed });
    expect((payload.parameters as { seed: number }).seed).toBe(seed);
  });

  it.each([-2, 1.5, 2147483648])('Wan rejects invalid seed %s without silently changing it', (seed) => {
    expect(() => buildVideoRequest({ ...base, model: 'wan3.0-video', seed })).toThrow('万相随机种子');
  });

  it('Vidu Q4 sends sounds and enables native audio when the audio switch is omitted', () => {
    const { payload } = buildVideoRequest({ ...base, model: 'viduq4-preview' });
    expect(payload.sounds).toEqual(audios);
    expect(payload.audio).toBe(true);
  });

  it.each(['doubao-seedance-2.0-mini', 'wan3.0-video', 'viduq4-preview'])('%s rejects silent audio references before building a request', (model) => {
    expect(() => buildVideoRequest({ ...base, model, audio: false })).toThrow('参考音频需要开启生成声音');
  });
});
