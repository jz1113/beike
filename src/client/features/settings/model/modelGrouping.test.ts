import { describe, expect, it } from 'vitest';
import { parseModelDetails, groupModelsByGeneration } from './modelGrouping';

describe('modelGrouping (generation row structure)', () => {
  it('parses models with accurate generation label and variants', () => {
    const p1 = parseModelDetails('claude-5.5-sonnet', 'chat');
    expect(p1.vendorId).toBe('anthropic');
    expect(p1.familyId).toBe('claude');
    expect(p1.versionLabel).toBe('5.5');
    expect(p1.variantKey).toBe('sonnet');

    const p2 = parseModelDetails('gpt-6.1-sol', 'chat');
    expect(p2.vendorId).toBe('openai');
    expect(p2.familyId).toBe('gpt');
    expect(p2.versionLabel).toBe('6.1');
    expect(p2.variantKey).toBe('sol');

    const p3 = parseModelDetails('gpt-3.5-turbo', 'chat');
    expect(p3.isArchived).toBe(true);

    // 验证特殊快照与倒置语序解析
    const p4 = parseModelDetails('gpt-4-1106-preview', 'chat');
    expect(p4.versionLabel).toBe('4');
    expect(p4.snapshotDate).toBe('1106');

    const p5 = parseModelDetails('claude-sonnet-5-5-thinking', 'chat');
    expect(p5.familyName).toBe('Claude');
    expect(p5.versionLabel).toBe('5.5');
    expect(p5.displayName).toBe('Sonnet 思考版');

    const p6 = parseModelDetails('claude-4-20250514-sonnet-thinking', 'chat');
    expect(p6.familyName).toBe('Claude');
    expect(p6.versionLabel).toBe('4');
    expect(p6.displayName).toBe('Sonnet 思考版');
    expect(p6.snapshotDate).toBe('20250514');

    const p7 = parseModelDetails('mimo-v2-flash', 'chat');
    expect(p7.vendorId).toBe('xiaomi');
    expect(p7.familyName).toBe('小米');

    const p8 = parseModelDetails('yi-lightning', 'chat');
    expect(p8.vendorId).toBe('yi');
    expect(p8.familyName).toBe('零一万物');

    const p9 = parseModelDetails('ernie-4.0', 'chat');
    expect(p9.vendorId).toBe('baidu');
    expect(p9.familyName).toBe('文心一言');
  });

  it('groups models into clean generation rows like Image 2', () => {
    const rawList = [
      'claude-5.5-opus',
      'claude-5.5-sonnet',
      'claude-5.5-haiku',
      'claude-5-opus',
      'gpt-6.1-sol',
      'gpt-6-astra',
      'gpt-5.6-sol',
      'gemini-3.5-flash',
      'gemini-3.1-pro',
    ];

    const sections = groupModelsByGeneration(rawList, 'chat');
    const anthropicSec = sections.find((s) => s.vendorId === 'anthropic');
    expect(anthropicSec).toBeDefined();

    const claude55Row = anthropicSec!.rows.find((r) => r.generationLabel === 'Claude 5.5');
    expect(claude55Row).toBeDefined();
    // 应该拥有 Opus, Sonnet, Haiku 三种规格变体
    expect(claude55Row!.variants.map((v) => v.displayName)).toEqual(['Opus', 'Sonnet', 'Haiku']);

    const openaiSec = sections.find((s) => s.vendorId === 'openai');
    expect(openaiSec).toBeDefined();
    const gpt61Row = openaiSec!.rows.find((r) => r.generationLabel === 'GPT 6.1');
    expect(gpt61Row).toBeDefined();
    expect(gpt61Row!.variants[0].displayName).toBe('Sol');
  });

  it('splits gateway video ids into separate generation rows', () => {
    const seedance25 = parseModelDetails('doubao-seedance-2.5', 'video');
    expect(seedance25.familyName).toBe('Seedance');
    expect(seedance25.generationLabel).toBe('Seedance 2.5');
    expect(seedance25.variantKey).toBe('default');

    const seedanceFast = parseModelDetails('doubao-seedance-2-0-fast-260128', 'video');
    expect(seedanceFast.generationLabel).toBe('Seedance 2.0');
    expect(seedanceFast.displayName).toBe('极速版');
    expect(seedanceFast.snapshotDate).toBe('2026-01-28');

    const seedanceLite = parseModelDetails('doubao-seedance-1-0-lite-t2v-250428', 'video');
    expect(seedanceLite.generationLabel).toBe('Seedance 1.0');
    expect(seedanceLite.displayName).toBe('Lite T2V');
    expect(seedanceLite.snapshotDate).toBe('2025-04-28');

    const veo = parseModelDetails('veo3.1', 'video');
    expect(veo.familyName).toBe('Veo');
    expect(veo.generationLabel).toBe('Veo 3.1');
    expect(veo.variantKey).toBe('default');

    const veoPro = parseModelDetails('veo3.1-pro', 'video');
    expect(veoPro.generationLabel).toBe('Veo 3.1');
    expect(veoPro.displayName).toBe('Pro');

    const wan = parseModelDetails('wan2.2', 'video');
    expect(wan.familyName).toBe('通义万相');
    expect(wan.generationLabel).toBe('通义万相 2.2');

    const wanx = parseModelDetails('wanx2.1-t2v', 'video');
    expect(wanx.familyId).toBe('wan');
    expect(wanx.generationLabel).toBe('通义万相 2.1');
    expect(wanx.displayName).toBe('T2V');

    const vidu = parseModelDetails('viduq3-pro', 'video');
    expect(vidu.familyName).toBe('Vidu');
    expect(vidu.generationLabel).toBe('Vidu Q3');
    expect(vidu.displayName).toBe('Pro');

    const gptVideo = parseModelDetails('gpt-video-2', 'video');
    expect(gptVideo.generationLabel).toBe('GPT Video 2');
    expect(gptVideo.variantKey).toBe('default');

    const jimeng = parseModelDetails('jimeng-videos', 'video');
    expect(jimeng.familyName).toBe('即梦');
    expect(jimeng.generationLabel).toBe('即梦');
    expect(jimeng.variantKey).toBe('default');

    const sections = groupModelsByGeneration([
      'doubao-seedance-2.5',
      'doubao-seedance-2-0-fast-260128',
      'doubao-seedance-2-0-260128',
      'doubao-seedance-2.0-mini',
      'doubao-seedance-1-5-pro-251215',
      'veo3.1',
      'veo3.1-fast',
      'veo3.1-pro',
      'jimeng-videos',
    ], 'video');

    const bytedance = sections.find((section) => section.vendorId === 'bytedance');
    expect(bytedance?.rows.map((row) => row.generationLabel)).toEqual([
      'Seedance 2.5',
      'Seedance 2.0',
      'Seedance 1.5',
      '即梦',
    ]);
    const seedance20 = bytedance?.rows.find((row) => row.generationLabel === 'Seedance 2.0');
    expect(seedance20?.variants.map((variant) => variant.displayName)).toEqual(['极速版', '标准版', 'Mini']);
    expect(seedance20?.variants.find((variant) => variant.displayName === '极速版')?.snapshots).toEqual([]);

    const google = sections.find((section) => section.vendorId === 'google');
    expect(google?.rows).toHaveLength(1);
    expect(google?.rows[0].generationLabel).toBe('Veo 3.1');
    expect(google?.rows[0].variants.map((variant) => variant.displayName)).toEqual(['Pro', '极速版', '标准版']);
  });

  it('labels reasoning suffixes in Chinese and keeps bare o-series out of General', () => {
    expect(parseModelDetails('o4-mini-deep-research').displayName).toBe('Mini 深度研究');
    expect(parseModelDetails('o4-mini-dr').displayName).toBe('Mini 深度研究');
    expect(parseModelDetails('gpt-5-high').displayName).toBe('高推理');
    expect(parseModelDetails('gpt-4o-all').displayName).toBe('全能版');

    const bare = parseModelDetails('o1');
    expect(bare.familyId).toBe('o1');
    expect(bare.familyName).toBe('O1');
    expect(bare.generationLabel).toBe('O1');

    const other = parseModelDetails('o3');
    expect(other.familyName).toBe('O3');
    expect(parseModelDetails('x').familyName).toBe('其他');
  });
});
