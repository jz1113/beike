import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate } from './scriptTemplate';
import { previewSeedancePromptSkeleton } from './scriptPromptPreview';

describe('source storyboard data export', () => {
  it('only includes recorded fields and preserves raw observations with labels', () => {
    const script = normalizeScriptTemplate({ title: '原片动作', durationSec: 5.6, voiceMode: 'none',
      visualSpec: { oneTake: true, cameraFeel: '固定机位，无推拉' },
      shots: [{ start: 0, end: 5.6, beats: [{ start: 0, end: 5.6,
        actionTemplate: '举起{{商品细节部位}}', expression: '垂眼后回望镜头', transition: '手臂回落',
        referenceActionRaw: '原片拿起旧品牌盒子', subtitle: '原片字幕', voice: { mode: 'none', text: '原片台词' },
      }] }],
      sourceExclusions: [{ type: 'brand_signage', term: '旧品牌', replacementRule: '剔除' }],
    })!;
    const before = JSON.stringify(script);
    const data = previewSeedancePromptSkeleton(script);
    for (const text of ['分镜资料：原片动作', '总时长：5.6 秒', '动作段 1（00:00 - 00:05.6）',
      '举起{{商品细节部位}}', '原片动作记录：原片拿起旧品牌盒子', '原片字幕记录：原片字幕',
      '原片台词记录：原片台词', '原片专属元素记录：', 'brand_signage：旧品牌（剔除）']) expect(data).toContain(text);
    for (const instruction of ['{{Mixed', '严格保持', '供后期', '无水印', '无画面字幕', '不张嘴说话', '沿用参考脚本', '不额外切镜']) expect(data).not.toContain(instruction);
    expect(JSON.stringify(script)).toBe(before);
  });
});
