import { describe, expect, it } from 'vitest';
import { salesScriptTemplateSchema } from '@shared/contracts/salesScripts';
import { detectExclusionLeaks, matchScriptProductReadiness, normalizeScriptTemplate, tryParsePastedScriptJson, validateScriptTemplate } from './scriptTemplate';
import { previewSeedancePromptSkeleton } from './scriptPromptPreview';
import { selectedProductImageViews } from './imageSelection';
import { setSalesImageView } from './imageCatalog';

const legacy = { title: '开衫穿搭', durationSec: 6, format: 'presenter', voiceMode: 'none', shots: [{ start: 0, end: 6, beats: [
  { start: 0, end: 2, action: '坐姿看镜头', requiredView: 'worn' },
  { start: 2, end: 6, action: '起身转身展示背部', requiredView: 'back' },
] }] };

describe('sales reference script template', () => {
  it('upgrades legacy scripts into a one-take template with asset slots', () => {
    const script = normalizeScriptTemplate(legacy)!;
    expect(script.visualSpec.oneTake).toBe(true);
    expect(script.assetSlots.productViews).toEqual(['worn', 'back']);
    expect(script.assetSlots.persona.presence).toBe('silent_model');
    expect(script.shots[0].beats[1].actionTemplate).toBe('起身转身展示背部');
    expect(validateScriptTemplate(script)).toEqual([]);
    expect(salesScriptTemplateSchema.safeParse(script).success).toBe(true);
  });

  it('rejects overlapping beats and empty action templates', () => {
    const script = normalizeScriptTemplate(legacy)!;
    script.shots[0].beats[1].start = 1;
    script.shots[0].beats[0].actionTemplate = '';
    const issues = validateScriptTemplate(script).join('\n');
    expect(issues).toContain('重叠');
    expect(issues).toContain('动作模板');
  });

  it('flags source-only product words left inside reusable actions', () => {
    const script = normalizeScriptTemplate({ ...legacy, sourceExclusions: [{ type: 'accessory', term: '黑色菱格纹链条包', replacementRule: '剔除' }] })!;
    script.shots[0].beats[0].actionTemplate = '单肩挎着黑色菱格纹链条包走来';
    expect(detectExclusionLeaks(script)).toEqual([{ label: '镜头 1-1 动作模板', term: '黑色菱格纹链条包' }]);
  });

  it('keeps source locations separate from photographic style and never labels unknown exclusions as products', () => {
    const script = normalizeScriptTemplate({ ...legacy, shots: [{ beats: [{ start: 0, end: 6, action: '抬手展示商品', scene: '旧服装店的红色试衣帘前' }] }],
      sourceExclusions: [{ type: 'scene', term: '旧服装店', replacementRule: '用当前场景' }, { type: 'future_type', term: '旧专属元素' }],
    })!;
    expect(script.visualSpec.styleSummary).toBe('');
    expect(script.shots[0].beats[0].scene).toBe('旧服装店的红色试衣帘前');
    expect(script.sourceExclusions.map((item) => item.type)).toEqual(['scene', 'copy_claim']);
    const parsed = salesScriptTemplateSchema.parse(script);
    expect(parsed.sourceExclusions[0].type).toBe('scene');
    expect(salesScriptTemplateSchema.parse({ ...script, sourceExclusions: [{ type: 'future_type', term: '旧元素' }] }).sourceExclusions[0].type).toBe('copy_claim');
  });

  it('reports missing product views from tagged selected images', () => {
    const script = normalizeScriptTemplate(legacy)!;
    const images = setSalesImageView([{ index: 0, url: 'a', role: 'main' }, { index: 1, url: 'b', role: 'detail' }], 'a', 'worn');
    const selection = selectedProductImageViews(images, { colorLabel: '', confirmedImageUrls: ['a', 'b'], excludedImageUrls: [] });
    expect(selection.untaggedCount).toBe(1);
    const readiness = matchScriptProductReadiness(script, selection.count, selection.views);
    expect(readiness.ready).toBe(false);
    expect(readiness.missingViews).toEqual(['back']);
  });

  it('parses fenced external JSON and exports recorded source data without invented reference slots', () => {
    const script = tryParsePastedScriptJson('结果如下：\n```json\n' + JSON.stringify({ script: legacy }) + '\n```')!;
    const prompt = previewSeedancePromptSkeleton(script);
    expect(prompt).toContain('分镜资料：开衫穿搭');
    expect(prompt).toContain('商品视角记录：');
    expect(prompt).toContain('背面');
    expect(prompt).toContain('动作段 2');
    expect(prompt).toContain('声音模式记录：none');
    expect(prompt).not.toContain('{{Mixed');
    expect(prompt).not.toContain('不张嘴说话');
    expect(tryParsePastedScriptJson('镜头一：她坐在桌前')).toBeNull();
  });
});
