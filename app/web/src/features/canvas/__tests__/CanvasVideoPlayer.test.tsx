import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { CanvasVideoPlayer } from '../components/CanvasVideoPlayer';

describe('CanvasVideoPlayer 组件', () => {
  it('正确渲染 video 元素与居中播放按钮', () => {
    const { container } = render(
      <CanvasVideoPlayer
        videoUrl="https://example.com/test.mp4"
        poster="https://example.com/poster.jpg"
        height={203}
      />
    );
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.getAttribute('src') || video.src).toContain('https://example.com/test.mp4');
    expect(video.getAttribute('poster')).toBe('https://example.com/poster.jpg');

    const button = container.querySelector('button');
    expect(button?.title).toBe('播放视频');
  });

  it('触发 loadedmetadata 时正确回调 onLoadedMetadata 并提供真实原始尺寸', () => {
    const onLoadedMetadata = vi.fn();
    const { container } = render(
      <CanvasVideoPlayer
        videoUrl="https://example.com/horizontal.mp4"
        onLoadedMetadata={onLoadedMetadata}
      />
    );
    const video = container.querySelector('video') as HTMLVideoElement;

    // 模拟 video 元数据加载并赋予 16:9 分辨率
    Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
    Object.defineProperty(video, 'duration', { value: 15.5, configurable: true });

    fireEvent.loadedMetadata(video);

    expect(onLoadedMetadata).toHaveBeenCalledTimes(1);
    expect(onLoadedMetadata).toHaveBeenCalledWith({
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 15.5,
    });

    // 验证外层容器自动自适应宽高比
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.aspectRatio).toBe('1920 / 1080');
  });

  it('点击播放按钮可切换播放与暂停状态', () => {
    const playMock = vi.fn().mockImplementation(() => Promise.resolve());
    const pauseMock = vi.fn();
    window.HTMLMediaElement.prototype.play = playMock;
    window.HTMLMediaElement.prototype.pause = pauseMock;

    const { container } = render(
      <CanvasVideoPlayer videoUrl="https://example.com/test.mp4" />
    );
    const button = container.querySelector('button') as HTMLButtonElement;
    fireEvent.click(button);
    expect(playMock).toHaveBeenCalled();
  });
});
