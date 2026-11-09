import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@client/shared/api/apiClient';
import { invalidateGlobalAssetCache } from '@client/shared/api/assetLibraryCache';
import { addSalesImageImportFiles, salesImageImportData } from '../model/salesImageImport';
import { submitSalesAssetJob } from './salesAssetJobs';
import {
  createSalesMaterial,
  fetchSalesStudioAssets,
  importSalesImageAsset,
  listSalesPrompts,
  SalesPromptRequestError,
  saveSalesPrompt,
  updateSalesSound,
} from './salesMaterials';
import { readSalesDepthReceipt } from './salesScriptImport';

vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn() }));
vi.mock('@client/shared/api/assetLibraryCache', async (importOriginal) => ({
  ...await importOriginal<typeof import('@client/shared/api/assetLibraryCache')>(),
  invalidateGlobalAssetCache: vi.fn(),
}));
vi.mock('./salesAssetJobs', () => ({ submitSalesAssetJob: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe('save reusable sales materials', () => {
  it('keeps both persona anchors and invalidates the shared library after confirmed save', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true })));
    await createSalesMaterial('persona', { name: '人物', avatarUrl: '/face.jpg', sourceImages: ['/body.jpg', '/face.jpg'] });
    const request = vi.mocked(apiFetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ assetType: 'persona', data: { avatarUrl: '/face.jpg', sourceImages: ['/body.jpg', '/face.jpg'] } });
    expect(invalidateGlobalAssetCache).toHaveBeenCalledOnce();
  });
  it('surfaces server failure and retains the current cache', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: false, error: '工作区不可写' }), { status: 403 }));
    await expect(createSalesMaterial('action', { action: '转身' })).rejects.toThrow('工作区不可写');
    expect(invalidateGlobalAssetCache).not.toHaveBeenCalled();
  });
  it('transports edited synthesis IDs through the existing sound PATCH endpoint', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true })));
    await updateSalesSound('chosen', { soundType: 'voice', voiceId: 'provider-voice-code' });
    expect(apiFetch).toHaveBeenCalledWith('/api/sales/studio-sounds/chosen', expect.objectContaining({ method: 'PATCH' }));
    expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body))).toEqual({ soundType: 'voice', voiceId: 'provider-voice-code' });
  });
});

it.each(['persona', 'scene'] as const)('creates the main-image %s asset directly when background generation is off', async (kind) => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true })));
  const data = { name: '只导入' }; const signal = new AbortController().signal;
  await importSalesImageAsset(kind, data, undefined, signal);
  expect(apiFetch).toHaveBeenCalledWith('/api/catalog/assets/library', expect.objectContaining({ method: 'POST', signal }));
  expect(submitSalesAssetJob).not.toHaveBeenCalled();
});

it.each(['persona', 'scene'] as const)('queues the selected model and stable upload key for %s without creating a duplicate base asset', async (kind) => {
  const item = addSalesImageImportFiles(kind, [], [new File(['image'], 'ref.jpg', { type: 'image/jpeg' })], []).items[0];
  const data = salesImageImportData(kind, item, '/ref.jpg', { personaGroup: 'female', sceneSpace: 'indoor' });
  const signal = new AbortController().signal;
  await importSalesImageAsset(kind, data, { model: 'selected-reference-model' }, signal);
  expect(submitSalesAssetJob).toHaveBeenCalledWith(kind, { key: item.key, model: 'selected-reference-model', references: ['/ref.jpg'] }, data, undefined, signal);
  expect(apiFetch).not.toHaveBeenCalled();
  await importSalesImageAsset(kind, data, { model: 'selected-reference-model' }, signal);
  expect(vi.mocked(submitSalesAssetJob).mock.calls[1][1].key).toBe(item.key);
});

it('rejects incomplete background requests without silently saving a plain asset', async () => {
  const signal = new AbortController().signal;
  await expect(importSalesImageAsset('persona', {}, { model: '' }, signal)).rejects.toThrow('请选择生图模型');
  expect(apiFetch).not.toHaveBeenCalled(); expect(submitSalesAssetJob).not.toHaveBeenCalled();
});

describe('sales production APIs', () => {
  it('loads personas, scenes, voices and royalty-free BGMs', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({
      success: true,
      personas: [
        { id: 'p1', name: '若曦', identityUrl: '/original.jpg', fullBodyUrl: '/b.jpg', faceUrl: '/f.jpg', hasReferenceImage: true },
        { id: 'legacy', name: '旧DTO人物', sourceImages: ['/unlabelled-first.jpg'] },
      ],
      scenes: [{ id: 's1', title: '法式客厅' }],
      voices: [{ id: 'v1', name: '温柔女声', ttsVoice: 'female-tianmei' }],
      bgms: [{ id: 'bgm_french_lazy', title: '法式暖阳', audioUrl: '/api/sales/bgm/bgm_french_lazy' }],
    })));
    const catalog = await fetchSalesStudioAssets();
    expect(catalog.personas[0].fullBodyUrl).toBe('/b.jpg');
    expect(catalog.personas[0].identityUrl).toBe('/original.jpg');
    expect(catalog.personas[1].identityUrl).toBeUndefined();
    expect(catalog.bgms[0].id).toBe('bgm_french_lazy');
  });
});

const prompt = { id: 'summary', title: '卖点提炼', description: '整理商品买点', prompt: '当前要求', defaultPrompt: '默认要求', version: 'v2', customized: true, configured: true };

it('reads effective prompts and defaults from the authenticated API', async () => {
  const abort = new AbortController();
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, prompts: [prompt] })));
  expect(await listSalesPrompts(abort.signal)).toEqual([prompt]);
  expect(apiFetch).toHaveBeenCalledWith('/api/sales/prompts', expect.objectContaining({ method: 'GET', signal: abort.signal, cache: 'no-store' }));
});

it('sends the edited text and the version being edited without transforming line breaks', async () => {
  const text = '第一行\n{{商品}}\nJSON 格式';
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, prompt: { ...prompt, prompt: text } })));
  await saveSalesPrompt('summary', text, 'v1');
  const [, options] = vi.mocked(apiFetch).mock.calls[0];
  expect(JSON.parse(String((options as RequestInit).body))).toEqual({ prompt: text, expectedVersion: 'v1' });
});

it('rejects a successful response that returns a default or a different prompt instead of the saved edit', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, prompt })));
  await expect(saveSalesPrompt('summary', '本次修改', 'v1')).rejects.toThrow('与本次保存不一致');
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, prompt: { ...prompt, id: 'plan-adapt', prompt: '本次修改' } })));
  await expect(saveSalesPrompt('summary', '本次修改', 'v1')).rejects.toThrow('与本次保存不一致');
});

it('preserves conflict status and rejects unsuccessful or malformed responses', async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: '提示词已被更新' }), { status: 409 }));
  await expect(saveSalesPrompt('summary', '编辑内容', 'v1')).rejects.toMatchObject({ message: '提示词已被更新', status: 409 });
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: false, prompts: [] })));
  await expect(listSalesPrompts()).rejects.toThrow();
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
  await expect(listSalesPrompts()).rejects.toBeInstanceOf(SalesPromptRequestError);
});

it('recovers the original operation through a read-only receipt query', async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, taskId: 'depth-1' })));
  const signal = new AbortController().signal;
  expect(await readSalesDepthReceipt(true, 'original key', signal)).toMatchObject({ taskId: 'depth-1' });
  expect(apiFetch).toHaveBeenCalledWith('/api/generate/depth-video?taskKey=original%20key', { signal });
});

it('keeps unresolved submission errors visible and never automatically re-submits', async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ status: 'QUERY_FAILED', error: '原结果待核对' })));
  await expect(readSalesDepthReceipt(false, 'key', new AbortController().signal)).rejects.toThrow('原结果待核对');
  expect(apiFetch).toHaveBeenCalledTimes(1);
});
