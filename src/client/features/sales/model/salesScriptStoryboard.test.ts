import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeScriptTemplate } from '@shared/domain/sales';
import {
  compareSalesAssetNames,
  nextSequentialSalesAssetName,
  readSalesAssetDraft,
  salesAssetDraftKey,
  salesAssetNumber,
  writeSalesAssetDraft,
  type SalesAssetDraft,
} from './salesAssetDraft';
import { addSalesImageImportFiles, nextSalesImageImportName, runSalesImageImportBatch, salesImageImportData, type SalesImageImportItem } from './salesImageImport';
import { buildScriptStoryboard, formatStoryboardTime } from './salesScriptStoryboard';

const sample = () => normalizeScriptTemplate({
  title: '自然光商品展示', durationSec: 12.4,
  visualSpec: { oneTake: true, styleSummary: '日系胶片质感', lighting: '窗边自然柔光' },
  shots: [{ start: 0, end: 12.4, summary: '连续展示', beats: [
    { start: 0, end: 5.1, purpose: 'hook', subject: '人物展示{{商品}}', actionTemplate: '双手轻抚{{商品}}', camera: '手持跟随', expression: '直视镜头，轻轻微笑', scene: '木质车厢', transition: '随动作自然衔接', voice: { mode: 'speech', text: '原片独有广告词', linePattern: '[开场惊叹]' } },
    { start: 5.1, end: 12.4, purpose: 'showcase', actionTemplate: '侧身展示{{商品}}' },
  ] }],
})!;

describe('script storyboard reading', () => {
  it('formats timestamps with tenths and handles minute carry', () => {
    expect([0, 5.1, 59.96, 600].map(formatStoryboardTime)).toEqual(['00:00', '00:05.1', '01:00', '10:00']);
  });

  it('numbers continuous beats and real cuts sequentially without modifying the stored timeline', () => {
    const script = sample();
    const before = JSON.stringify(script);
    script.shots.push({ ...script.shots[0], start: 12.4, end: 14, summary: '结尾定格', beats: [{ ...script.shots[0].beats[1], start: 12.4, end: 14 }] });
    const shots = buildScriptStoryboard(script);
    expect(shots.map((shot) => shot.title)).toEqual(['分镜一', '分镜二', '分镜三']);
    expect(shots[1].segments[0]).toMatchObject({ address: { shot: 0, beat: 1 }, range: '00:05.1 - 00:12.4' });
    expect(shots.map((shot) => shot.number)).toEqual(['01.1', '01.2', '02']);
    expect(shots[2]).toMatchObject({ index: 3, range: '00:12.4 - 00:14' });
    expect(shots[0].fields.map((field) => field.label)).toEqual(['画面风格', '主体', '动作描述', '镜头变化', '人物神态']);
    script.shots.pop();
    expect(JSON.stringify(script)).toBe(before);
  });

  it('builds recorded storyboard fields without adding generation instructions', () => {
    const script = sample();
    const prompt = buildScriptStoryboard(script)[0].segments[0].prompt;
    for (const text of ['5.1秒', '日系胶片质感', '窗边自然柔光', '人物展示{{商品}}', '木质车厢', '双手轻抚{{商品}}', '手持跟随', '直视镜头', '[开场惊叹]', '一镜到底']) expect(prompt).toContain(text);
    expect(prompt).toContain('原片台词记录：原片独有广告词');
    for (const added of ['无水印', '无额外字幕', '不额外增加镜头运动', '填入当前商品']) expect(prompt).not.toContain(added);
  });

  it('preserves source entities and raw observations as records rather than replacing them with invented product instructions', () => {
    const script = sample();
    const beat = script.shots[0].beats[0];
    Object.assign(beat, { subject: '原片品牌', scene: '私人配饰', referenceActionRaw: '原片观察专属内容', subtitle: '原片字幕' });
    const prompt = buildScriptStoryboard(script)[0].segments[0].prompt;
    for (const raw of ['主体：原片品牌', '场景与光线：私人配饰', '原片动作记录：原片观察专属内容', '原片字幕记录：原片字幕']) expect(prompt).toContain(raw);
  });

  it('records voice mode and audio availability without inventing mouth or speech directions', () => {
    const script = sample();
    const beat = script.shots[0].beats[0];
    beat.voice.mode = 'voiceover';
    expect(buildScriptStoryboard(script)[0].segments[0].prompt).toContain('声音模式记录：voiceover；音轨可用：是');
    script.audioAvailable = false;
    expect(buildScriptStoryboard(script)[0].segments[0].prompt).toContain('声音模式记录：voiceover；音轨可用：否');
    expect(buildScriptStoryboard(script)[0].segments[0].prompt).not.toContain('人物不做说话口型');
    expect(buildScriptStoryboard(script)[1].segments[0].prompt).not.toContain('未记录');
  });
});

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  });
});
afterEach(() => vi.unstubAllGlobals());

const draft: SalesAssetDraft = {
  fields: { name: '人物', group: 'female', voiceId: 'voice' }, views: { main: '/main.jpg', face: '/face.jpg' }, extraImages: ['/extra.jpg'], model: 'model',
  request: { key: 'original-key', jobId: 'background-job', assetId: 'saved-asset', model: 'model', references: ['/main.jpg'], prompt: 'original prompt', promptVersion: 'v1', taskId: 'task', recordId: 'original-record', resultUrl: '/grid.png', images: { face: '/face.jpg' } },
};

it('retains the form, references, idempotency key, task and completed images across reloads', () => {
  const key = salesAssetDraftKey('workspace', 'persona');
  writeSalesAssetDraft(key, draft);
  expect(readSalesAssetDraft(key)).toEqual(draft);
});

it('isolates drafts between workspaces, asset kinds, and existing asset IDs', () => {
  const key = salesAssetDraftKey('workspace-a', 'persona');
  writeSalesAssetDraft(key, draft);
  expect(readSalesAssetDraft(salesAssetDraftKey('workspace-b', 'persona'))).toBeNull();
  expect(readSalesAssetDraft(salesAssetDraftKey('workspace-a', 'scene'))).toBeNull();
  expect(readSalesAssetDraft(salesAssetDraftKey('workspace-a', 'persona', 'existing-id'))).toBeNull();
  expect(readSalesAssetDraft(key)).toEqual(draft);
});

it('does not replace existing image references when only form fields were saved', () => {
  const key = salesAssetDraftKey('workspace', 'scene', 'existing');
  writeSalesAssetDraft(key, { fields: { name: '修改名称' } });
  expect(readSalesAssetDraft(key)).toMatchObject({ fields: { name: '修改名称' } });
  expect(readSalesAssetDraft(key)?.views).toBeUndefined();
  expect(readSalesAssetDraft(key)?.extraImages).toBeUndefined();
});

it('ignores corrupt drafts without deleting their original bytes', () => {
  values.set('corrupt', '{');
  expect(readSalesAssetDraft('corrupt')).toBeNull();
  expect(values.get('corrupt')).toBe('{');
  values.set('invalid', JSON.stringify({ fields: { name: 123 }, views: { main: {} }, request: { key: 'k', model: {}, references: null } }));
  expect(readSalesAssetDraft('invalid')).toMatchObject({ fields: {}, views: {}, request: null });
});

it.each(['persona', 'scene'] as const)('continues the existing %s import numbering independently of custom names', (kind) => {
  const prefix = kind === 'persona' ? '人物' : '场景';
  const names = [`${prefix}12`, '新建样本', `${prefix}2`, '用户自定义', `${prefix} 003`, `${prefix}1`];
  expect(nextSequentialSalesAssetName(kind, names)).toBe(`${prefix}13`);
  expect(salesAssetNumber(kind, `${prefix}12修改版`)).toBeUndefined();
});

it.each(['人物', '女', '男', '场景', '室内', '户外', '动作', '人声', 'BGM'])('sorts every %s name in natural ascending order, including custom numbered names', (prefix) => {
  const names = [`${prefix}10`, `${prefix}2`, `${prefix} 003`, `${prefix}1`];
  expect([...names].sort(compareSalesAssetNames)).toEqual([`${prefix}1`, `${prefix}2`, `${prefix} 003`, `${prefix}10`]);
});

it('sorts unnumbered names too, without a separate custom-name group', () => {
  expect(['B2', 'A10', 'B', 'A2', 'A'].sort(compareSalesAssetNames)).toEqual(['A', 'A2', 'A10', 'B', 'B2']);
});

const file = (name = 'photo.jpg') => new File(['image'], name, { type: 'image/jpeg', lastModified: 1 });
const category = { personaGroup: 'male', sceneSpace: 'outdoor' } as const;
const signal = () => new AbortController().signal;

describe('person and scene batch image import', () => {
  it('uses the largest existing asset number across gaps, ignoring custom names and other asset kinds', () => {
    expect(nextSalesImageImportName('persona', ['人物1', '人物 003', '人物20', '人物20定稿', '场景90'])).toBe('人物21');
    expect(nextSalesImageImportName('scene', ['厨房', '场景2', '场景9'])).toBe('场景10');
    const first = addSalesImageImportFiles('persona', [], [file('a.jpg'), file('b.jpg')], ['人物6']);
    expect(first.items.map((item) => item.name)).toEqual(['人物7', '人物8']);
    const second = addSalesImageImportFiles('persona', first.items, [file('a.jpg'), file('c.jpg')], ['人物6']);
    expect(second.items.map((item) => item.name)).toEqual(['人物7', '人物8', '人物9']);
    expect(new Set(second.items.map((item) => item.key)).size).toBe(3);
  });

  it('rejects unsupported, empty and oversized images, and limits the whole queue across selections', () => {
    const large = file('large.jpg'); Object.defineProperty(large, 'size', { value: 20 * 1024 * 1024 + 1 });
    const result = addSalesImageImportFiles('scene', [], [file(), file('bad.svg'), large, new File([], 'empty.jpg')], []);
    expect(result.items).toHaveLength(1); expect(result.errors).toHaveLength(3);
    const first = addSalesImageImportFiles('scene', [], Array.from({ length: 49 }, (_, index) => file(`${index}.jpg`)), []);
    const next = addSalesImageImportFiles('scene', first.items, [file('50.jpg'), file('51.jpg')], []);
    expect(next.items).toHaveLength(50); expect(next.errors).toHaveLength(1);
  });

  it('stores one main image per asset, current category, and a reconciliation key', () => {
    const item = addSalesImageImportFiles('persona', [], [file()], []).items[0];
    const persona = salesImageImportData('persona', item, '/main.jpg', category);
    expect(persona).toMatchObject({ name: '人物1', tags: '青年男', avatarUrl: '/main.jpg', sourceImages: '["/main.jpg"]' });
    expect(JSON.parse(persona.dimensions as string)).toMatchObject({ salesImageImportKey: item.key, personaViews: { main: '/main.jpg', front: '' }, defaultVoiceId: '' });
    const scene = salesImageImportData('scene', { ...item, name: '场景1' }, '/scene.jpg', category);
    expect(scene).toMatchObject({ title: '场景1', tags: '户外', spatialType: 'outdoor', coverUrl: '/scene.jpg', sourceImages: '["/scene.jpg"]' });
    expect(JSON.parse(scene.dimensions as string)).toMatchObject({ salesImageImportKey: item.key, sceneViews: { main: '/scene.jpg', left: '' } });
  });

  it('continues after failure and retries failed saves without reuploading or duplicating successes', async () => {
    let items = addSalesImageImportFiles('persona', [], [file('a.jpg'), file('b.jpg')], []).items;
    const update = (key: string, patch: Partial<SalesImageImportItem>) => { items = items.map((item) => item.key === key ? { ...item, ...patch } : item); };
    const upload = vi.fn().mockResolvedValueOnce('/a.jpg').mockResolvedValueOnce('/b.jpg');
    const save = vi.fn().mockRejectedValueOnce(new Error('保存失败')).mockResolvedValue(undefined);
    const services = { catalog: vi.fn().mockResolvedValue([]), upload, save };
    expect(await runSalesImageImportBatch('persona', items, category, signal(), services, update)).toBe(1);
    expect(items.map((item) => item.status)).toEqual(['error', 'done']);
    expect(items[0]).toMatchObject({ imageUrl: '/a.jpg', error: '保存失败' });
    expect(await runSalesImageImportBatch('persona', items, category, signal(), services, update)).toBe(1);
    expect(upload).toHaveBeenCalledTimes(2); expect(save).toHaveBeenCalledTimes(3);
    expect(items.every((item) => item.status === 'done')).toBe(true);
  });

  it('recognizes an asset saved before a lost response and adjusts remaining names against the latest catalog', async () => {
    let items = addSalesImageImportFiles('scene', [], [file('a.jpg'), file('b.jpg'), file('c.jpg')], []).items;
    const update = (key: string, patch: Partial<SalesImageImportItem>) => { items = items.map((item) => item.key === key ? { ...item, ...patch } : item); };
    const services = { catalog: vi.fn().mockResolvedValue([
      { name: '场景1', dimensions: JSON.stringify({ salesImageImportKey: items[0].key }) }, { name: '场景2' },
    ]), upload: vi.fn().mockResolvedValue('/main.jpg'), save: vi.fn().mockResolvedValue(undefined) };
    expect(await runSalesImageImportBatch('scene', items, category, signal(), services, update)).toBe(3);
    expect(items.map((item) => item.name)).toEqual(['场景1', '场景3', '场景4']);
    expect(services.upload).toHaveBeenCalledTimes(2); expect(services.save).toHaveBeenCalledTimes(2);
  });

  it('advances stale previews past newly created larger numbers while retaining failed items names on retry', async () => {
    let items = addSalesImageImportFiles('persona', [], [file('a.jpg'), file('b.jpg')], []).items;
    const update = (key: string, patch: Partial<SalesImageImportItem>) => { items = items.map((item) => item.key === key ? { ...item, ...patch } : item); };
    const services = { catalog: vi.fn().mockResolvedValue([{ name: '人物10' }]), upload: vi.fn().mockResolvedValue('/main.jpg'), save: vi.fn().mockRejectedValueOnce(new Error('保存失败')).mockResolvedValue(undefined) };
    await runSalesImageImportBatch('persona', items, category, signal(), services, update);
    expect(items.map((item) => item.name)).toEqual(['人物11', '人物12']);
    services.catalog.mockResolvedValue([{ name: '人物10' }, { name: '人物12' }]);
    await runSalesImageImportBatch('persona', items, category, signal(), services, update);
    expect(items.map((item) => item.name)).toEqual(['人物11', '人物12']);
    expect(services.upload).toHaveBeenCalledTimes(2);
    expect(services.save).toHaveBeenLastCalledWith('persona', expect.objectContaining({ name: '人物11' }), expect.any(AbortSignal));
  });

  it('stops when disposed and refuses to save when the catalog cannot be reconciled', async () => {
    const items = addSalesImageImportFiles('scene', [], [file('a.jpg'), file('b.jpg')], []).items;
    const controller = new AbortController();
    const services = { catalog: vi.fn().mockResolvedValue([]), upload: vi.fn().mockImplementation(async () => { controller.abort(); return '/a.jpg'; }), save: vi.fn() };
    expect(await runSalesImageImportBatch('scene', items, category, controller.signal, services, vi.fn())).toBe(0);
    expect(services.upload).toHaveBeenCalledTimes(1); expect(services.save).not.toHaveBeenCalled();
    services.catalog.mockRejectedValueOnce(new Error('读取失败'));
    await expect(runSalesImageImportBatch('scene', items, category, signal(), services, vi.fn())).rejects.toThrow('读取失败');
    expect(services.save).not.toHaveBeenCalled();
  });
});
