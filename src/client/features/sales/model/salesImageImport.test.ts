import { describe, expect, it, vi } from 'vitest';
import { addSalesImageImportFiles, nextSalesImageImportName, runSalesImageImportBatch, salesImageImportData, type SalesImageImportItem } from './salesImageImport';

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
