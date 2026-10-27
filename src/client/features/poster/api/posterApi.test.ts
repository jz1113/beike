import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '@client/shared/api/apiRequest';
import { pollSingleTask, submitImageGenTask } from '@client/shared/api/generation/generationApi';
import { loadImageForCanvas, rasterizeCoverImage } from '../model/coverExport';
import { COVER_FORMATS } from '../model/coverFormat';
import { buildDesignPlan, type PosterItem } from '../model/posterTypes';
import { directCoverDesign, generateFinalCover } from './posterApi';

vi.mock('@client/shared/api/apiRequest', () => ({ apiRequest: vi.fn() }));
vi.mock('@client/shared/api/apiClient', () => ({ storageConfigHeaders: () => ({}) }));
vi.mock('@client/shared/utils/modelUsage', () => ({ recordChatTokens: vi.fn() }));
vi.mock('@client/shared/api/generation/generationApi', () => ({ pollSingleTask: vi.fn(), submitImageGenTask: vi.fn() }));
vi.mock('../model/coverExport', () => ({ loadImageForCanvas: vi.fn(), rasterizeCoverImage: vi.fn() }));

const item: PosterItem = {
  id: 'poster-product', sourceImageUrl: 'http://localhost:5173/storage/local/product.png',
  originalTitle: '商品原标题', productName: '', coverTitle: '商品封面标题',
  status: 'idle', format: COVER_FORMATS.portrait,
};
const plan = buildDesignPlan(item.coverTitle, { title: item.coverTitle, titleLines: [item.coverTitle], imagePrompt: '完整设计提示词' });
const revoke = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { location: { origin: 'http://localhost:5173' } });
  vi.mocked(loadImageForCanvas).mockResolvedValue({ image: {} as HTMLImageElement, revoke });
  vi.mocked(rasterizeCoverImage).mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('poster image submission and recovery', () => {
  it('exports an existing scene without submitting or polling another paid task', async () => {
    const result = await generateFinalCover(item.sourceImageUrl, item.originalTitle, item.coverTitle, '', item.format,
      undefined, undefined, 'image-model', 'high', () => false, { sceneUrl: '/storage/result.png', required: true });
    expect(submitImageGenTask).not.toHaveBeenCalled();
    expect(pollSingleTask).not.toHaveBeenCalled();
    expect(loadImageForCanvas).toHaveBeenCalledWith('/storage/result.png');
    expect(revoke).toHaveBeenCalledOnce();
    URL.revokeObjectURL(result);
  });

  it('recovers a completed request by submission key after its response was lost', async () => {
    vi.mocked(apiRequest).mockResolvedValue(Response.json({ success: true, taskId: 'original-task', status: 'SUCCESS', resultUrl: '/storage/result.png' }));
    const onTaskSubmitted = vi.fn();
    const result = await generateFinalCover(item.sourceImageUrl, item.originalTitle, item.coverTitle, '', item.format,
      undefined, undefined, 'image-model', 'high', () => false, { submissionKey: 'original-key', required: true, onTaskSubmitted });
    expect(onTaskSubmitted).toHaveBeenCalledWith('original-task');
    expect(submitImageGenTask).not.toHaveBeenCalled();
    expect(pollSingleTask).not.toHaveBeenCalled();
    URL.revokeObjectURL(result);
  });

  it('preserves the generated scene callback when export fails', async () => {
    vi.mocked(submitImageGenTask).mockResolvedValue('/storage/result.png');
    vi.mocked(rasterizeCoverImage).mockRejectedValue(new Error('比例不符'));
    const onSceneGenerated = vi.fn();
    await expect(generateFinalCover(item.sourceImageUrl, item.originalTitle, item.coverTitle, '', item.format,
      plan, plan.generationDirection, 'image-model', 'high', () => false, { submissionKey: 'new-key', onSceneGenerated })).rejects.toThrow('比例不符');
    expect(onSceneGenerated).toHaveBeenCalledWith('/storage/result.png');
    expect(submitImageGenTask).toHaveBeenCalledOnce();
    expect(vi.mocked(submitImageGenTask).mock.calls[0][0]).toMatchObject({ referenceImages: ['/storage/local/product.png'] });
    expect(revoke).toHaveBeenCalledOnce();
  });

  it('keeps failed original tasks terminal until the caller handles the failure', async () => {
    vi.mocked(apiRequest).mockResolvedValue(Response.json({ taskId: 'original-task', status: 'FAILURE', failReason: '上游拒绝' }));
    await expect(generateFinalCover(item.sourceImageUrl, item.originalTitle, item.coverTitle, '', item.format,
      plan, plan.generationDirection, 'image-model', 'high', () => false, { submissionKey: 'original-key', required: true })).rejects.toMatchObject({ name: 'ImageGenBusinessError' });
    expect(submitImageGenTask).not.toHaveBeenCalled();
  });
});

describe('poster design audit metadata', () => {
  it('accepts long original titles while keeping itemTitle within the API limit', async () => {
    vi.mocked(apiRequest).mockResolvedValue(Response.json({ success: true, data: { title: item.coverTitle } }));
    const originalTitle = '长标题'.repeat(100);
    await directCoverDesign({ ...item, originalTitle }, item.coverTitle, 'vision-model');
    const body = JSON.parse(vi.mocked(apiRequest).mock.calls[0][2]!.body as string);
    expect(body.originalTitle).toBe(originalTitle);
    expect(body.itemTitle).toHaveLength(200);
    expect(body.imageUrls).toEqual(['/storage/local/product.png']);
  });
});
