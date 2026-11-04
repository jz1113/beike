import { describe, expect, it } from 'vitest';
import { buildVideoRequest } from '../index';

describe('Metaso Context IR transport', () => {
  it.each([undefined, true, false])('sends the explicit native value %s without losing false', (contextIrEnabled) => {
    const request = buildVideoRequest({ model: 'MiniMax-H3', baseUrl: 'https://metaso.cn/api', prompt: '镜头推进',
      refMode: 'omni', duration: 15, resolution: '1080P', images: ['https://cdn.example/person.png'], audios: ['https://cdn.example/voice.wav'], contextIrEnabled });
    expect(request.payload.context_ir_enabled).toBe(contextIrEnabled ?? true);
    expect(request.payload.resolution).toBe('1080P');
    expect(request.payload.content).toContainEqual({ type: 'audio_url', audio_url: { url: 'https://cdn.example/voice.wav' }, role: 'reference_audio' });
  });

  it.each(['https://api.minimax.cn', 'https://ai.comfly.org', 'https://metaso.cn.example.com'])('omits the Metaso-only parameter for %s', (baseUrl) => {
    expect(buildVideoRequest({ model: 'MiniMax-H3', baseUrl, prompt: '镜头推进', duration: 15, resolution: '1080P', contextIrEnabled: false }).payload)
      .not.toHaveProperty('context_ir_enabled');
  });
});
