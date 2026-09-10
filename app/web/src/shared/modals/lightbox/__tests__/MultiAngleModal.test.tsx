// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { MultiAngleModal } from '../MultiAngleModal';

describe('MultiAngleModal', () => {
  const mockImageUrl = 'https://example.com/test-character.png';

  beforeEach(() => {
    cleanup();
  });

  it('在 isOpen 为 false 时不渲染任何内容', () => {
    const { container } = render(
      <MultiAngleModal
        isOpen={false}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        onSubmitNovelView={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('在 isOpen 为 true 时正确渲染标题、原图、9宫格方位预设与生成按钮', () => {
    render(
      <MultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        originalPrompt="动漫原画群像"
        onSubmitNovelView={vi.fn()}
      />,
    );

    expect(screen.getByText('多角度编辑')).toBeInTheDocument();
    expect(screen.getByText('摄像机方位')).toBeInTheDocument();

    // 验证 9 宫格预设按钮
    expect(screen.getByText('左上')).toBeInTheDocument();
    expect(screen.getByText('俯视')).toBeInTheDocument();
    expect(screen.getByText('右上')).toBeInTheDocument();
    expect(screen.getByText('左视')).toBeInTheDocument();
    expect(screen.getByText('正视')).toBeInTheDocument();
    expect(screen.getByText('右视')).toBeInTheDocument();
    expect(screen.getByText('左下')).toBeInTheDocument();
    expect(screen.getByText('仰视')).toBeInTheDocument();
    expect(screen.getByText('右下')).toBeInTheDocument();

    // 验证重置参数和生成按钮
    expect(screen.getByText('重置参数')).toBeInTheDocument();
    expect(screen.getByText('生成')).toBeInTheDocument();
  });

  it('点击「左上」预设方位时，角度自动切换为 315° 与 30°', () => {
    render(
      <MultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        onSubmitNovelView={vi.fn()}
      />,
    );

    const topLeftBtn = screen.getByText('左上');
    fireEvent.click(topLeftBtn);

    expect(screen.getByText('315°')).toBeInTheDocument();
    expect(screen.getByText('30°')).toBeInTheDocument();
  });

  it('点击「俯视」预设方位时，角度自动切换为 0° 与 60°', () => {
    render(
      <MultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        onSubmitNovelView={vi.fn()}
      />,
    );

    const topBtn = screen.getByText('俯视');
    fireEvent.click(topBtn);

    expect(screen.getByText('0°')).toBeInTheDocument();
    expect(screen.getByText('60°')).toBeInTheDocument();
  });

  it('调节角度后点击「重置参数」，能恢复至 0° 与 0°', () => {
    render(
      <MultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        onSubmitNovelView={vi.fn()}
      />,
    );

    // 先点击左上 (315°, 30°)
    fireEvent.click(screen.getByText('左上'));
    expect(screen.getByText('315°')).toBeInTheDocument();

    // 点击重置
    fireEvent.click(screen.getByText('重置参数'));
    expect(screen.getAllByText('0°').length).toBeGreaterThanOrEqual(2);
  });

  it('点击生成按钮时，触发 onSubmitNovelView 并传出参数与关闭弹窗', () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <MultiAngleModal
        isOpen={true}
        onClose={handleClose}
        imageUrl={mockImageUrl}
        onSubmitNovelView={handleSubmit}
      />,
    );

    // 选择右上 (45°, 30°)
    fireEvent.click(screen.getByText('右上'));

    // 点击生成按钮
    const submitBtn = screen.getByRole('button', { name: '生成' });
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        azimuth: 45,
        elevation: 30,
        angleName: '右上',
        model: expect.any(String),
        quality: expect.any(String),
        aspectRatio: expect.any(String),
      }),
    );
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('支持在弹窗内切换生图模型、画质档位和画幅比例，并在提交时正确回传', () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <MultiAngleModal
        isOpen={true}
        onClose={handleClose}
        imageUrl={mockImageUrl}
        onSubmitNovelView={handleSubmit}
      />,
    );

    // 1. 打开模型切换菜单
    const modelBtn = screen.getByTitle('点击切换生图模型');
    fireEvent.click(modelBtn);
    expect(screen.getByText('生图模型配置')).toBeInTheDocument();

    // 2. 打开尺寸与画质切换菜单
    const sizeBtn = screen.getByTitle('点击切换尺寸与分辨率');
    fireEvent.click(sizeBtn);
    expect(screen.getByText('清晰度 / 分辨率')).toBeInTheDocument();
    expect(screen.getByText('输出尺寸比例')).toBeInTheDocument();

    // 切换 1K 画质
    const quality1kBtn = screen.getByRole('button', { name: /^1K$/ });
    fireEvent.click(quality1kBtn);

    // 切换 16:9 比例
    const ratio169Btn = screen.getByRole('button', { name: '16:9' });
    fireEvent.click(ratio169Btn);

    // 3. 点击生成按钮
    const submitBtn = screen.getByRole('button', { name: '生成' });
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        azimuth: 0,
        elevation: 0,
        angleName: '正视',
        quality: 'low',
        aspectRatio: '16:9',
      }),
    );
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
