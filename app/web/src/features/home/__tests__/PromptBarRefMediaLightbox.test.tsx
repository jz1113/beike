// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PromptBarRefMediaLightbox } from '../components/prompt-bar/media/PromptBarRefMediaLightbox';

describe('PromptBarRefMediaLightbox 放大预览灯箱测试 (纯净无顶栏沉浸式设计)', () => {
  beforeEach(() => {
    cleanup();
  });
  const mockImages = [
    'https://example.com/img1.jpg',
    'https://example.com/img2.png',
    'https://example.com/video1.mp4',
  ];

  it('单张图片正常渲染大图，无多余顶栏，点击空白背景区域触发 onClose', () => {
    const handleClose = vi.fn();
    render(
      <PromptBarRefMediaLightbox
        items={['https://example.com/img1.jpg']}
        currentIndex={0}
        onClose={handleClose}
      />
    );

    // 确保没有原先顶部的干扰标签和多余按钮
    expect(screen.queryByText('参考图片')).toBeNull();
    expect(screen.queryByTitle('关闭放大预览 (Esc)')).toBeNull();
    expect(screen.queryByText('查看原件')).toBeNull();

    // 确保图片正常渲染
    const img = screen.getByAltText('参考素材-1');
    expect(img).toBeDefined();

    // 点击最外层空白遮罩区域，直接触发 onClose 退出全屏
    const overlay = document.querySelector('.fixed.inset-0');
    expect(overlay).toBeDefined();
    if (overlay) {
      fireEvent.click(overlay);
      expect(handleClose).toHaveBeenCalledTimes(1);
    }
  });

  it('多张素材展示切换箭头，点击下一张/上一张能切换素材', () => {
    const handleClose = vi.fn();
    const handleIndexChange = vi.fn();

    render(
      <PromptBarRefMediaLightbox
        items={mockImages}
        currentIndex={0}
        onClose={handleClose}
        onIndexChange={handleIndexChange}
      />
    );

    // 验证初始为第 1 张素材
    expect(screen.getByAltText('参考素材-1')).toBeDefined();

    // 点击下一张
    const nextBtn = screen.getByTitle('下一张 (→)');
    fireEvent.click(nextBtn);
    expect(handleIndexChange).toHaveBeenCalledWith(1);
    expect(screen.getByAltText('参考素材-2')).toBeDefined();

    // 点击上一张回到第 1 张
    const prevBtn = screen.getByTitle('上一张 (←)');
    fireEvent.click(prevBtn);
    expect(handleIndexChange).toHaveBeenCalledWith(0);
    expect(screen.getByAltText('参考素材-1')).toBeDefined();
  });

  it('支持键盘快捷键：Escape 关闭，ArrowRight/ArrowLeft 切换', () => {
    const handleClose = vi.fn();
    const handleIndexChange = vi.fn();

    render(
      <PromptBarRefMediaLightbox
        items={mockImages}
        currentIndex={0}
        onClose={handleClose}
        onIndexChange={handleIndexChange}
      />
    );

    // 按下右方向键 ArrowRight
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(handleIndexChange).toHaveBeenCalledWith(1);
    expect(screen.getByAltText('参考素材-2')).toBeDefined();

    // 按下 Esc 键关闭
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('识别视频文件并渲染 video 播放器', () => {
    const handleClose = vi.fn();

    render(
      <PromptBarRefMediaLightbox
        items={['https://example.com/video1.mp4']}
        currentIndex={0}
        onClose={handleClose}
      />
    );

    const videoEl = document.querySelector('video');
    expect(videoEl).toBeDefined();
    expect(videoEl?.getAttribute('src')).toBe('https://example.com/video1.mp4');
  });
});
