import { beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '@client/shared/api/apiRequest';
import { pollSingleTaskResult, submitImageGenTaskResult } from '@client/shared/api/generation/generationApi';
import { convertImageToJpeg } from '@client/shared/media/imageJpeg';
import { PERSONA_VIEWS } from '../model/salesPersonaViews';
import { SCENE_VIEWS } from '../model/salesSceneViews';
import { generateSalesAssetGrid, uploadSalesViewImage, type AssetViewRequest } from './salesAssetViews';
import { listSalesPrompts } from './salesPrompts';
import { uploadSalesCustomAsset } from './salesProduction';

vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/gatewayClient', () => ({ getModelCredentials: () => ({}) }));
vi.mock('@client/shared/api/generation/generationApi', () => ({ submitImageGenTaskResult: vi.fn(), pollSingleTaskResult: vi.fn() }));
vi.mock('./salesProduction', () => ({ uploadSalesCustomAsset: vi.fn() }));
vi.mock('./salesPrompts', () => ({ listSalesPrompts: vi.fn() }));
vi.mock('@client/shared/media/imageJpeg', () => ({ convertImageToJpeg: vi.fn() }));

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0xff, 0xd9]);
const jpeg = new Blob([jpegBytes], { type: 'image/jpeg' });
const gridImages = (kind: 'persona' | 'scene' = 'persona', whole = true) => kind === 'persona' && whole ? [{view: 'sheet', url: '/stored/sheet.jpg'}] : (kind === 'persona' ? PERSONA_VIEWS : SCENE_VIEWS)
  .filter(({ id }) => id !== 'main').map(({ id }) => ({ view: id, url: `/stored/${id}.jpg` }));
const requestFor = (patch: Partial<AssetViewRequest> = {}): AssetViewRequest => ({
  key: 'key', model: 'gpt-image-2', references: ['/main.jpg'], ...patch,
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listSalesPrompts).mockResolvedValue(['persona', 'scene'].map((kind) => ({
    id: `${kind}-grid`, title: '九宫格', description: '', prompt: `${kind} 视角模板`, defaultPrompt: '', version: 'grid-v1', customized: true, configured: true,
  })));
  vi.mocked(submitImageGenTaskResult).mockResolvedValue({ url: '/grid.png', temporary: false });
  vi.mocked(apiRequest).mockImplementation(async (_method, _path, options) => new Response(JSON.stringify({
    success: true, images: gridImages(JSON.parse(String(options?.body)).kind, !!JSON.parse(String(options?.body)).whole),
  })));
  vi.mocked(convertImageToJpeg).mockResolvedValue(jpeg);
  vi.mocked(uploadSalesCustomAsset).mockImplementation(async (file) => `/stored/${file.name}`);
});

it.each(['persona', 'scene'] as const)('submits one %s grid then crops the expected views on the backend', async (kind) => {
  const request = requestFor();
  const signal = new AbortController().signal;
  const onStage = vi.fn();
  const result = await generateSalesAssetGrid(kind, request, signal, onStage);
  expect(onStage.mock.calls).toEqual([['prompt'], ['generating'], ['cropping']]);
  expect(Object.entries(result)).toHaveLength(kind === 'persona' ? 1 : 9);
  expect(result).toEqual(Object.fromEntries(gridImages(kind).map(({ view, url }) => [view, url])));
  expect(submitImageGenTaskResult).toHaveBeenCalledTimes(1);
  const [payload, deps] = vi.mocked(submitImageGenTaskResult).mock.calls[0];
  expect(payload).toMatchObject({ model: request.model, prompt: `${kind} 视角模板`, aspectRatio: kind === 'persona' ? '16:9' : '4:3',
    quality: 'high', useReferenceImage: true, referenceImages: ['/main.jpg'], metadata: { layout: kind === 'persona' ? '1x4' : '3x3', promptVersion: 'grid-v1' } });
  expect(payload.size).toMatch(/^\d+x\d+$/);
  await deps.onTaskSubmitted?.('original-task');
  expect(request.taskId).toBe('original-task');
  expect(deps.idempotencyKey).toBe('key');
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith('POST', '/api/sales/asset-view-grid', {
    signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, layout: kind === 'persona' ? '1x4' : '3x3', ...(kind === 'persona' && {whole: true}), imageUrl: '/grid.png' }),
  });
  expect(uploadSalesCustomAsset).not.toHaveBeenCalled();
  expect(convertImageToJpeg).not.toHaveBeenCalled();
});

it('limits references and resolution to the selected image model capabilities', async () => {
  await generateSalesAssetGrid('scene', requestFor({ model: 'gemini-2.5-flash-image', references: ['/main.jpg', '/left.jpg', '/right.jpg', '/reverse.jpg'] }), new AbortController().signal);
  expect(submitImageGenTaskResult).toHaveBeenCalledWith(expect.objectContaining({
    referenceImages: ['/main.jpg', '/left.jpg', '/right.jpg'], quality: 'low',
  }), expect.any(Object));
});

it.each(['/remote-grid.png', 'data:image/png;base64,cG5nLWJ5dGVz'])('passes temporary or inline output to the backend for cropping: %s', async (url) => {
  vi.mocked(submitImageGenTaskResult).mockResolvedValueOnce({ url, temporary: true });
  await generateSalesAssetGrid('persona', requestFor(), new AbortController().signal);
  expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls[0][2]?.body))).toEqual({ kind: 'persona', layout: '1x4', whole: true, imageUrl: url });
});

it('polls the original task and uses the stored prompt instead of generating again', async () => {
  vi.mocked(pollSingleTaskResult).mockResolvedValue({ url: '/original-grid.png', temporary: false });
  const request = requestFor({ taskId: 'old-task' });
  await generateSalesAssetGrid('persona', request, new AbortController().signal);
  expect(submitImageGenTaskResult).not.toHaveBeenCalled();
  expect(listSalesPrompts).not.toHaveBeenCalled();
  expect(pollSingleTaskResult).toHaveBeenCalledExactlyOnceWith('old-task', expect.any(Function), undefined, request.model);
});

it('retries failed cropping of a synchronous result without a second paid submission', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ error: '保存裁片失败' }), { status: 500 }));
  const request = requestFor();
  const signal = new AbortController().signal;
  const onStage = vi.fn();
  await expect(generateSalesAssetGrid('persona', request, signal, onStage)).rejects.toThrow('保存裁片失败');
  expect(onStage).toHaveBeenLastCalledWith('cropping');
  expect(request.taskId).toBeUndefined();
  expect(request.resultUrl).toBe('/grid.png');
  onStage.mockClear();
  await generateSalesAssetGrid('persona', request, signal, onStage);
  expect(onStage.mock.calls).toEqual([['cropping']]);
  expect(submitImageGenTaskResult).toHaveBeenCalledTimes(1);
  expect(pollSingleTaskResult).not.toHaveBeenCalled();
  expect(apiRequest).toHaveBeenCalledTimes(2);
  expect(vi.mocked(apiRequest).mock.calls[0][2]?.body).toBe(vi.mocked(apiRequest).mock.calls[1][2]?.body);
});

it('reuses validated crops without submitting, polling or cropping again', async () => {
  const request = requestFor();
  const signal = new AbortController().signal;
  const images = await generateSalesAssetGrid('persona', request, signal);
  expect(await generateSalesAssetGrid('persona', request, signal)).toBe(images);
  expect(submitImageGenTaskResult).toHaveBeenCalledTimes(1);
  expect(apiRequest).toHaveBeenCalledTimes(1);
});

it.each(['missing', 'duplicate', 'wrong-kind'])('rejects %s crop results without discarding the generated grid', async (condition) => {
  const images = gridImages(condition === 'wrong-kind' ? 'scene' : 'persona');
  if (condition === 'missing') images.pop();
  if (condition === 'duplicate') images[1] = images[0];
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, images })));
  const request = requestFor();
  await expect(generateSalesAssetGrid('persona', request, new AbortController().signal)).rejects.toThrow('裁切结果不完整');
  expect(request.images).toBeUndefined();
  expect(request.resultUrl).toBe('/grid.png');
});

it('keeps the frozen prompt and idempotency key after an uncertain submission', async () => {
  vi.mocked(submitImageGenTaskResult).mockRejectedValueOnce(new Error('network interrupted'));
  const request = requestFor();
  const signal = new AbortController().signal;
  await expect(generateSalesAssetGrid('persona', request, signal)).rejects.toThrow('network interrupted');
  vi.mocked(listSalesPrompts).mockResolvedValue([]);
  await generateSalesAssetGrid('persona', request, signal);
  expect(listSalesPrompts).toHaveBeenCalledTimes(1);
  expect(vi.mocked(submitImageGenTaskResult).mock.calls[1][0].prompt).toBe('persona 视角模板');
  expect(vi.mocked(submitImageGenTaskResult).mock.calls[1][1].idempotencyKey).toBe('key');
});

it('identifies an old backend without submitting or using a retired single-view prompt', async () => {
  vi.mocked(listSalesPrompts).mockResolvedValue([{ id: 'persona-face', title: '脸部', description: '', prompt: '只生成脸部', defaultPrompt: '只生成脸部', version: 'old', customized: false, configured: false }]);
  const request = requestFor();
  await expect(generateSalesAssetGrid('persona', request, new AbortController().signal)).rejects.toThrow('请重启贝壳服务');
  expect(request.prompt).toBeUndefined();
  expect(submitImageGenTaskResult).not.toHaveBeenCalled();
  expect(apiRequest).not.toHaveBeenCalled();
});

it('does not use the initial grid template when the workspace has not saved it', async () => {
  vi.mocked(listSalesPrompts).mockResolvedValue([{ id: 'persona-grid', title: '人物补图', description: '', prompt: '', defaultPrompt: '初始九宫格要求', version: 'unconfigured', configured: false, customized: false }]);
  await expect(generateSalesAssetGrid('persona', requestFor(), new AbortController().signal)).rejects.toThrow('请先在提示词管理中保存');
  expect(submitImageGenTaskResult).not.toHaveBeenCalled();
});

it('stops an aborted generation before submission or crop requests', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(generateSalesAssetGrid('persona', requestFor(), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(listSalesPrompts).not.toHaveBeenCalled();
  expect(submitImageGenTaskResult).not.toHaveBeenCalled();
  expect(apiRequest).not.toHaveBeenCalled();
});

it('still converts manual uploads to JPG bytes and filename', async () => {
  const original = new File(['png bytes'], '人物.正面.PNG', { type: 'image/png' });
  const signal = new AbortController().signal;
  await expect(uploadSalesViewImage(original, original.name, signal)).resolves.toBe('/stored/人物.正面.jpg');
  expect(convertImageToJpeg).toHaveBeenCalledWith(original, signal);
  const [file] = vi.mocked(uploadSalesCustomAsset).mock.calls[0];
  expect(file.type).toBe('image/jpeg');
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(jpegBytes);
});

it('retries reading the original grid without polling or generating after a download failure', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({ error: '读取失败', code: 'image_read_failed' }), { status: 400 }));
  const request = requestFor({ taskId: 'original-task', resultUrl: '/original-grid.png' });
  const signal = new AbortController().signal;
  await expect(generateSalesAssetGrid('persona', request, signal)).rejects.toThrow('读取失败');
  expect(request.resultUrl).toBe('/original-grid.png');
  await generateSalesAssetGrid('persona', request, signal);
  expect(pollSingleTaskResult).not.toHaveBeenCalled();
  expect(submitImageGenTaskResult).not.toHaveBeenCalled();
  expect(apiRequest).toHaveBeenCalledTimes(2);
  expect(vi.mocked(apiRequest).mock.calls[1][2]?.body).toBe(vi.mocked(apiRequest).mock.calls[0][2]?.body);
  expect(JSON.parse(String(vi.mocked(apiRequest).mock.calls[1][2]?.body)).imageUrl).toBe('/original-grid.png');
});

it.each(['persona', 'scene'] as const)('retains an oversized %s grid for crop retries without polling or regenerating', async (kind) => {
  vi.mocked(apiRequest).mockResolvedValueOnce(new Response(JSON.stringify({
    error: '九宫格图片超过 64 MB', code: 'image_too_large',
  }), { status: 413 }));
  const request = requestFor({ taskId: 'original-task', resultUrl: '/large-grid.png' });
  const signal = new AbortController().signal;
  await expect(generateSalesAssetGrid(kind, request, signal)).rejects.toThrow('九宫格图片超过 64 MB');
  expect(request).toMatchObject({ taskId: 'original-task', resultUrl: '/large-grid.png' });
  expect(request.images).toBeUndefined();

  await generateSalesAssetGrid(kind, request, signal);
  expect(submitImageGenTaskResult).not.toHaveBeenCalled();
  expect(pollSingleTaskResult).not.toHaveBeenCalled();
  expect(listSalesPrompts).not.toHaveBeenCalled();
  expect(apiRequest).toHaveBeenCalledTimes(2);
  expect(vi.mocked(apiRequest).mock.calls[1][2]?.body).toBe(vi.mocked(apiRequest).mock.calls[0][2]?.body);
  expect(request.images).toEqual(Object.fromEntries(gridImages(kind, false).map(({ view, url }) => [view, url])));
});

it('checkpoints each generation stage before waiting for the next network operation', async () => {
  const request = requestFor();
  const checkpoints: AssetViewRequest[] = [];
  vi.mocked(submitImageGenTaskResult).mockImplementationOnce(async (_input, options) => {
    expect(checkpoints.at(-1)).toMatchObject({ key: 'key', prompt: 'persona 视角模板' });
    await options.onTaskSubmitted?.('paid-task');
    expect(checkpoints.at(-1)).toMatchObject({ taskId: 'paid-task' });
    return { url: '/original-grid.jpg', temporary: false };
  });
  await generateSalesAssetGrid('persona', request, new AbortController().signal, undefined, () => checkpoints.push(structuredClone(request)));
  expect(checkpoints.map((item) => [Boolean(item.prompt), item.taskId, item.resultUrl, Boolean(item.images)])).toEqual([
    [true, undefined, undefined, false],
    [true, 'paid-task', undefined, false],
    [true, 'paid-task', '/original-grid.jpg', false],
    [true, 'paid-task', '/original-grid.jpg', true],
  ]);
});

it('retains a late result after closing so the original grid can still be recovered', async () => {
  const controller = new AbortController();
  const request = requestFor();
  const checkpoints: AssetViewRequest[] = [];
  vi.mocked(submitImageGenTaskResult).mockImplementationOnce(async (_input, options) => {
    await options.onTaskSubmitted?.('paid-task');
    controller.abort();
    return { url: '/completed-grid.jpg', temporary: false };
  });
  await expect(generateSalesAssetGrid('persona', request, controller.signal, undefined, () => checkpoints.push(structuredClone(request))))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(checkpoints.at(-1)).toMatchObject({ taskId: 'paid-task', resultUrl: '/completed-grid.jpg' });
  expect(apiRequest).not.toHaveBeenCalled();
});
