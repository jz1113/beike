import { describe, it, expect } from 'vitest';
import { resolveImageSlotsAndPrompt } from '../slotResolver';
import { buildImageRequest } from '@beike/domain/modelAdapters';

describe('resolveImageSlotsAndPrompt 文生图提示词保护测试', () => {
  it('普通文生图 (无参考图) 严禁注入 @图片1 或商品实物模板', async () => {
    const rawPrompt = '动漫原画群像，内容一切随机';
    const body = {
      prompt: rawPrompt,
      model: 'gpt-image-2',
      source: 'home',
      useReferenceImage: false,
    };

    const result = await resolveImageSlotsAndPrompt(body, {
      finalSize: '2448x3264',
      effectiveAspect: '3:4',
      effectiveQuality: 'high',
    });

    expect(result.error).toBeUndefined();
    expect(result.cleanedPrompt).toBe(rawPrompt);
    expect(result.cleanedPrompt).not.toContain('@图片1');
    expect(result.cleanedPrompt).not.toContain('商品实物');
    expect(result.isPlainMode).toBe(true);
    expect(result.multiImages.length).toBe(0);

    // 验证经过 buildImageRequest 适配层后，输出的 prompt 依然纯净无污染
    const adapted = buildImageRequest({
      model: 'gpt-image-2',
      prompt: result.cleanedPrompt,
      size: '2448x3264',
      quality: 'high',
      plainMode: result.isPlainMode,
    });

    expect(adapted.payload.prompt).toBe(rawPrompt);
    expect(adapted.payload.prompt).not.toContain('@图片1');
    expect(adapted.payload.prompt).not.toContain('商品实物');
  });

  it('缺省 source 且无参考图的文生图同样必须保持原样', async () => {
    const rawPrompt = '赛博朋克雨夜街道，霓虹灯光影';
    const body = {
      prompt: rawPrompt,
      model: 'gpt-image-2',
    };

    const result = await resolveImageSlotsAndPrompt(body, {
      finalSize: '2448x3264',
      effectiveAspect: '3:4',
      effectiveQuality: 'high',
    });

    expect(result.cleanedPrompt).toBe(rawPrompt);
    expect(result.cleanedPrompt).not.toContain('@图片1');
  });

  it('多角度旧版度数提示词在后端自动清洗并升级为防九宫格透视重构提示词', async () => {
    const legacyPrompt = '多角度视角转换(机位: 129° / 0) 动漫原画群像，内容一切随机';
    const body = {
      prompt: legacyPrompt,
      model: 'gpt-image-2',
      referenceImageUrl: 'https://example.com/test.png',
      useReferenceImage: true,
    };

    const result = await resolveImageSlotsAndPrompt(body, {
      finalSize: '2448x3264',
      effectiveAspect: '3:4',
      effectiveQuality: 'high',
    });

    // 验证旧版度数括号已被清洗，且注入了单视角透视与反九宫格硬约束
    expect(result.cleanedPrompt).not.toContain('多角度视角转换(机位: 129° / 0)');
    expect(result.cleanedPrompt).toContain('【全新单视角摄影转换】');
    expect(result.cleanedPrompt).toContain('【空间透视重构】');
    expect(result.cleanedPrompt).toContain('【单幅画面硬性约束】');
    expect(result.cleanedPrompt).toContain('绝对严禁九宫格拼图');
    expect(result.cleanedPrompt).toContain('严禁分镜接触表');
    expect(result.cleanedPrompt).toContain('动漫原画群像，内容一切随机');

    // 核心回归校验：确保参考图被完整保留在 multiImages 中，绝不退化为空
    expect(result.multiImages.length).toBeGreaterThanOrEqual(1);
    expect(result.multiImages).toContain('https://example.com/test.png');
    expect(result.imageCount).toBeGreaterThanOrEqual(1);
  });

  it('普通生图/多角度仅传入 referenceImageUrl 时，multiImages 与 primaryImgUrl 必须锁定原图', async () => {
    const rawPrompt = '宝可梦小智和喷火龙合照';
    const refUrl = 'https://cdn.example.com/pokemon.png';
    const body = {
      prompt: rawPrompt,
      model: 'gpt-image-2',
      referenceImageUrl: refUrl,
      useReferenceImage: true,
    };

    const result = await resolveImageSlotsAndPrompt(body, {
      finalSize: '2448x3264',
      effectiveAspect: '3:4',
      effectiveQuality: 'medium',
    });

    expect(result.error).toBeUndefined();
    expect(result.multiImages).toEqual([refUrl]);
    expect(result.imageCount).toBe(1);
    expect(result.primaryImgUrl).toBe(refUrl);
    expect(result.editsImageUrls).toContain(refUrl);
  });
});
