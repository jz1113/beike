import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitSingleGenerationTask } from '../generationTaskSubmitter';
import type { GenerationTask } from '@/types/store';

// 模拟 apiClient
const mockApiFetch = vi.fn();
vi.mock('@/lib/apiClient', () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

describe('generationTaskSubmitter 主页生成请求参数纯净性保障测试', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, taskId: 'test-task-123' }),
    });
  });

  it('主页纯文生图：绝不发送商品专有字段 (productImageUrl/productTitle) 且提示词保持原样', async () => {
    const task: GenerationTask = {
      id: 'task-img-1',
      title: '动漫原画群像，内容一切随机',
      prompt: '动漫原画群像，内容一切随机',
      mediaType: 'image',
      model: 'gpt-image-2',
      status: 'IN_PROGRESS',
      createdAt: Date.now(),
    };

    await submitSingleGenerationTask(task, vi.fn(), {}, new Set());

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = mockApiFetch.mock.calls[0];
    expect(endpoint).toBe('/api/generate/image');

    const body = JSON.parse(options.body);
    expect(body.prompt).toBe('动漫原画群像，内容一切随机');
    expect(body.productImageUrl).toBeUndefined();
    expect(body.productTitle).toBeUndefined();
    expect(body.workshopMode).toBeUndefined();
    expect(body.source).toBe('home');
  });

  it('主页全能视频生成 (omni)：绝不自动塞入首尾帧 (first_frame_image/last_frame_image)', async () => {
    const task: GenerationTask = {
      id: 'task-video-1',
      title: '二次元女孩在樱花树下转身微笑',
      prompt: '二次元女孩在樱花树下转身微笑',
      mediaType: 'video',
      model: 'doubao-seedance-2.5',
      videoRefMode: 'omni',
      referenceImages: ['https://example.com/ref1.jpg', 'https://example.com/ref2.jpg'],
      status: 'IN_PROGRESS',
      createdAt: Date.now(),
    };

    await submitSingleGenerationTask(task, vi.fn(), {}, new Set());

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = mockApiFetch.mock.calls[0];
    expect(endpoint).toBe('/api/generate/video');

    const body = JSON.parse(options.body);
    expect(body.prompt).toBe('二次元女孩在樱花树下转身微笑');
    expect(body.ref_mode).toBe('omni');
    // 全能参考模式严禁伪造首尾帧
    expect(body.first_frame_image).toBeUndefined();
    expect(body.last_frame_image).toBeUndefined();
    expect(body.images).toHaveLength(2);
  });

  it('首尾帧视频生成：仅在明确是 first_last_frame 模式时才注入首尾帧', async () => {
    const task: GenerationTask = {
      id: 'task-video-fl',
      title: '首尾帧运镜过渡',
      prompt: '平滑运镜平移过渡',
      mediaType: 'video',
      model: 'doubao-seedance-2.5',
      videoRefMode: 'first_last_frame',
      referenceImages: ['https://example.com/start.jpg', 'https://example.com/end.jpg'],
      status: 'IN_PROGRESS',
      createdAt: Date.now(),
    };

    await submitSingleGenerationTask(task, vi.fn(), {}, new Set());

    const [endpoint, options] = mockApiFetch.mock.calls[0];
    expect(endpoint).toBe('/api/generate/video');

    const body = JSON.parse(options.body);
    expect(body.ref_mode).toBe('first_last_frame');
    expect(body.first_frame_image).toBe('https://example.com/start.jpg');
    expect(body.last_frame_image).toBe('https://example.com/end.jpg');
  });

  it('多角度生图任务：保留主图、images、任务元数据，避免重复发送 referenceImages', async () => {
    const originalUrl = 'https://example.com/pokemon-ash.png';
    const task: GenerationTask = {
      id: 'fast-angle-1',
      title: '多角度视角转换(微俯)',
      prompt: '【全新单视角摄影转换】...',
      mediaType: 'image',
      model: 'gpt-image-2',
      referenceImageUrl: originalUrl,
      referenceImages: [originalUrl],
      images: [originalUrl],
      useReferenceImage: true,
      taskType: 'multi_angle',
      angleName: '微俯',
      sourceImageUrl: originalUrl,
      status: 'IN_PROGRESS',
      createdAt: Date.now(),
    };

    await submitSingleGenerationTask(task, vi.fn(), {}, new Set());

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [endpoint, options] = mockApiFetch.mock.calls[0];
    expect(endpoint).toBe('/api/generate/image');

    const body = JSON.parse(options.body);
    expect(body.referenceImageUrl).toBe(originalUrl);
    expect(body.images).toEqual([originalUrl]);
    expect(body.referenceImages).toBeUndefined();
    expect(body.taskType).toBe('multi_angle');
    expect(body.angleName).toBe('微俯');
    expect(body.sourceImageUrl).toBe(originalUrl);
  });
});
