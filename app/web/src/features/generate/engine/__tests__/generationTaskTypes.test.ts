import { describe, it, expect } from 'vitest';
import { DEPTH_VIDEO_MODEL_ID } from '@beike/shared/depthVideo';
import {
  isDepthVideoTask,
  isDepthImageTask,
  isVideoTask,
  getMaxPollCount,
} from '../generationTaskTypes';
import type { GenerationTask } from '@/store/useAppStore';

describe('generationTaskTypes helpers', () => {
  it('正确识别深度视频任务', () => {
    const task1 = { id: 'depth_123', prompt: 'test' } as GenerationTask;
    const task2 = { id: 'normal_1', mediaType: 'depth-video', prompt: 'test' } as GenerationTask;
    const task3 = { id: 'normal_2', model: DEPTH_VIDEO_MODEL_ID, prompt: 'test' } as GenerationTask;
    const normalTask = { id: 'normal_3', prompt: 'test' } as GenerationTask;

    expect(isDepthVideoTask(task1)).toBe(true);
    expect(isDepthVideoTask(task2)).toBe(true);
    expect(isDepthVideoTask(task3)).toBe(true);
    expect(isDepthVideoTask(normalTask)).toBe(false);
  });

  it('正确识别深度静态图任务', () => {
    const task1 = { id: '1', mediaType: 'depth-image', prompt: 'test' } as GenerationTask;
    const task2 = { id: '2', mediaType: 'image', prompt: 'test' } as GenerationTask;

    expect(isDepthImageTask(task1)).toBe(true);
    expect(isDepthImageTask(task2)).toBe(false);
  });

  it('正确识别视频生成模型与文件类型', () => {
    const videoTask1 = { id: '1', model: 'doubao-seedance-2.5', prompt: 'test' } as GenerationTask;
    const videoTask2 = { id: '2', model: 'kling-v1', prompt: 'test' } as GenerationTask;
    const videoTask3 = { id: '3', resultUrl: 'https://cdn.example.com/out.mp4', prompt: 'test' } as GenerationTask;
    const imageTask = { id: '4', model: 'gpt-image-2', prompt: 'test' } as GenerationTask;

    expect(isVideoTask(videoTask1)).toBe(true);
    expect(isVideoTask(videoTask2)).toBe(true);
    expect(isVideoTask(videoTask3)).toBe(true);
    expect(isVideoTask(imageTask)).toBe(false);
  });

  it('针对不同分辨率与模型动态计算最大允许轮询次数', () => {
    const videoTask = { id: '1', mediaType: 'video', prompt: 'test' } as GenerationTask;
    const image4kTask = { id: '2', quality: 'high', size: '3840x2160', prompt: 'test' } as GenerationTask;
    const image2kTask = { id: '3', quality: 'medium', size: '2048x2048', prompt: 'test' } as GenerationTask;
    const imageNormalTask = { id: '4', quality: 'standard', size: '1024x1024', prompt: 'test' } as GenerationTask;

    expect(getMaxPollCount(videoTask)).toBe(300);
    expect(getMaxPollCount(image4kTask)).toBe(450);
    expect(getMaxPollCount(image2kTask)).toBe(300);
    expect(getMaxPollCount(imageNormalTask)).toBe(180);
  });
});
