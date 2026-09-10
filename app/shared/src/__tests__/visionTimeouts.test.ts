import { describe, expect, it } from 'vitest';
import {
  VISION_TIMEOUT_FLASH_MS,
  VISION_TIMEOUT_THINKING_MS,
  formatVisionAnalyzeError,
  resolveVisionTimeoutMs,
} from '../visionTimeouts';

describe('visionTimeouts', () => {
  it('gives thinking/luna 6 minutes and flash 2 minutes', () => {
    expect(VISION_TIMEOUT_THINKING_MS).toBe(360_000);
    expect(resolveVisionTimeoutMs('gpt-5.6-luna')).toBe(360_000);
    expect(resolveVisionTimeoutMs('gemini-3.7-flash')).toBe(VISION_TIMEOUT_FLASH_MS);
    expect(VISION_TIMEOUT_FLASH_MS).toBe(180_000);
  });

  it('preserves detailed timeout + billing hint from callVisionModel', () => {
    const msg =
      '视觉模型响应超时（已等待约 360 秒），请稍后重试或换用 Flash 极速模型。上游可能仍会计费，请勿立刻重复提交';
    expect(formatVisionAnalyzeError(new Error(msg))).toBe(msg);
  });

  it('maps generic timeout to ~6 minutes with billing hint', () => {
    expect(formatVisionAnalyzeError(new Error('请求超时，请稍后重试'))).toBe(
      '视觉模型响应超时（已等待约 6 分钟），请稍后重试或换用 Flash 极速模型。上游可能仍会计费，请勿立刻重复提交',
    );
  });
});
