// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { LightboxInfoPanel } from '../LightboxInfoPanel';

describe('LightboxInfoPanel 参考素材行内展示逻辑', () => {
  beforeEach(() => {
    cleanup();
  });

  const baseTask = {
    id: 'task-1',
    prompt: '成熟饱满的树莓，果实外观、深红色泽和表皮光泽参考@图片4；特写微距镜头',
    resultUrl: 'https://example.com/result-raspberry-4.jpg',
    status: 'SUCCESS' as const,
    model: 'gpt-image-2',
    size: '3:4',
    quality: '4K',
    createdAt: Date.now(),
  };

  it('单参考素材仅保留参数行入口，不再显示重复卡片', () => {
    const taskWithSingleRef = {
      ...baseTask,
      referenceImages: ['https://example.com/ref-single.jpg'],
    };

    render(
      <LightboxInfoPanel
        previewTask={taskWithSingleRef as any}
        authorName="贝壳云图官方"
        isVideo={false}
        dateStr="2026-09-08"
        isLongPrompt={false}
        isPromptExpanded={false}
        setIsPromptExpanded={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    );

    expect(screen.queryByText('参考素材')).not.toBeInTheDocument();
    expect(screen.queryByText('查看高清原图')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '参考图' })).toBeInTheDocument();
  });

  it('多参考素材时：显示行内素材入口，标签准确显示为 @图片1 到 @图片4，与提示词一字不差对齐', () => {
    const taskWithFourRefs = {
      ...baseTask,
      referenceImages: [
        'https://example.com/ref-1.jpg',
        'https://example.com/ref-2.jpg',
        'https://example.com/ref-3.jpg',
        'https://example.com/ref-4.jpg',
      ],
    };

    render(
      <LightboxInfoPanel
        previewTask={taskWithFourRefs as any}
        authorName="贝壳云图官方"
        isVideo={false}
        dateStr="2026-09-08"
        isLongPrompt={false}
        isPromptExpanded={false}
        setIsPromptExpanded={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    );

    // 验证参考素材数量为 4
    expect(screen.queryByText('参考素材')).not.toBeInTheDocument();


    // 验证多图微卡片的标签为 @图片1, @图片2, @图片3, @图片4
    expect(screen.getByText('@图片1')).toBeInTheDocument();
    expect(screen.getByText('@图片2')).toBeInTheDocument();
    expect(screen.getByText('@图片3')).toBeInTheDocument();
    expect(screen.getByText('@图片4')).toBeInTheDocument();
  });

  it('翻页到子任务自身字段缺少素材时：自动通过 fallbackReferenceImages 兜底展现完整 4 张参考素材', () => {
    // 模拟翻页到第 4 张图，该子任务自身未冗余存储 referenceImages
    const taskWithoutRefs = {
      ...baseTask,
      referenceImages: undefined,
      referenceImageUrl: undefined,
      images: undefined,
    };

    const fallbackRefs = [
      'https://example.com/ref-1.jpg',
      'https://example.com/ref-2.jpg',
      'https://example.com/ref-3.jpg',
      'https://example.com/ref-4.jpg',
    ];

    render(
      <LightboxInfoPanel
        previewTask={taskWithoutRefs as any}
        authorName="贝壳云图官方"
        isVideo={false}
        dateStr="2026-09-08"
        isLongPrompt={false}
        isPromptExpanded={false}
        setIsPromptExpanded={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
        fallbackReferenceImages={fallbackRefs}
      />,
    );

    // 即使当前子任务自身无素材字段，面板依然能够通过兜底展示全部 4 张素材
    expect(screen.queryByText('参考素材')).not.toBeInTheDocument();

    expect(screen.getByText('@图片1')).toBeInTheDocument();
    expect(screen.getByText('@图片2')).toBeInTheDocument();
    expect(screen.getByText('@图片3')).toBeInTheDocument();
    expect(screen.getByText('@图片4')).toBeInTheDocument();
  });

  it('排除与当前大图结果 URL 相同的素材，防止混淆', () => {
    const taskWithResultDuplicate = {
      ...baseTask,
      referenceImages: [
        'https://example.com/result-raspberry-4.jpg', // 与当前结果图相同
        'https://example.com/ref-actual-input.jpg',
      ],
    };

    render(
      <LightboxInfoPanel
        previewTask={taskWithResultDuplicate as any}
        authorName="贝壳云图官方"
        isVideo={false}
        dateStr="2026-09-08"
        isLongPrompt={false}
        isPromptExpanded={false}
        setIsPromptExpanded={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    );

    // 重复结果图被过滤，最终只剩 1 张实际输入素材，呈现单素材卡片
    expect(screen.queryByText('参考素材')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: '参考图' })).toBeInTheDocument();
  });

  it('视频首尾帧运镜模式：正确展示“首帧”与“尾帧”标签', () => {
    const videoTask = {
      ...baseTask,
      mediaType: 'video',
      videoRefMode: 'first_last_frame',
      referenceImages: [
        'https://example.com/frame-start.jpg',
        'https://example.com/frame-end.jpg',
      ],
    };

    render(
      <LightboxInfoPanel
        previewTask={videoTask as any}
        authorName="贝壳云图官方"
        isVideo={true}
        dateStr="2026-09-08"
        isLongPrompt={false}
        isPromptExpanded={false}
        setIsPromptExpanded={vi.fn()}
        onUsePromptOnly={vi.fn()}
        onUseAsReference={vi.fn()}
      />,
    );

    expect(screen.queryByText('使用的视频素材')).not.toBeInTheDocument();

    expect(screen.getAllByText('首帧').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('尾帧')).toBeInTheDocument();
  });
  it('视频参考使用 video 缩略图，代理失败回退原地址，再失败仍保留入口', () => {
    const url = 'https://example.com/reference.mp4';
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = render(<LightboxInfoPanel isVideo previewTask={{ ...baseTask, referenceImages: [url] } as any} />);
    expect(screen.getByRole('button', { name: /参考视频/ })).toBeInTheDocument();
    expect(screen.queryByText('首帧')).not.toBeInTheDocument();
    const video = container.querySelector('video')!;
    expect(video).toBeInTheDocument();
    expect(video.getAttribute('src')).toContain('as=video');
    fireEvent.error(video);
    expect(container.querySelector('video')).toHaveAttribute('src', url);
    fireEvent.error(container.querySelector('video')!);
    expect(container.querySelector('video')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '参考视频' }));
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

});
