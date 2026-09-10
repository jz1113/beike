// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { OutpaintModal } from '../OutpaintModal';

describe('OutpaintModal', () => {
  const mockImageUrl = 'https://example.com/character.png';

  beforeEach(() => {
    cleanup();
  });

  it('在 isOpen 为 false 时不渲染任何内容', () => {
    const { container } = render(
      <OutpaintModal
        isOpen={false}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        onSubmitOutpaint={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('在 isOpen 为 true 时正确渲染标题、比例胶囊行与生成按钮', () => {
    render(
      <OutpaintModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        originalPrompt="动漫原画群像"
        onSubmitOutpaint={vi.fn()}
      />,
    );

    expect(screen.getByText('扩图')).toBeInTheDocument();
    expect(screen.getByText('原比例')).toBeInTheDocument();
    expect(screen.getByText('1:1')).toBeInTheDocument();
    expect(screen.getByText('9:16')).toBeInTheDocument();
    expect(screen.getByText('4:3')).toBeInTheDocument();
    expect(screen.getByText('16:9')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('描述想要扩图的内容，不填将基于原图生成')).toBeInTheDocument();
    expect(screen.getByText('生成')).toBeInTheDocument();
  });

  it('点击「16:9」切换比例时，外扩标注更新为 W:2.4x H:1x', () => {
    render(
      <OutpaintModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        onSubmitOutpaint={vi.fn()}
      />,
    );

    const ratioBtn = screen.getByText('16:9');
    fireEvent.click(ratioBtn);

    expect(screen.getByText('W:2.4x H:1.0x')).toBeInTheDocument();
  });

  it('输入扩图提示词并点击生成按钮时，触发 onSubmitOutpaint 并传递参数与关闭弹窗', () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <OutpaintModal
        isOpen={true}
        onClose={handleClose}
        imageUrl={mockImageUrl}
        onSubmitOutpaint={handleSubmit}
      />,
    );

    // 切换到 16:9
    fireEvent.click(screen.getByText('16:9'));

    const input = screen.getByPlaceholderText('描述想要扩图的内容，不填将基于原图生成');
    fireEvent.change(input, { target: { value: '扩展两侧的森林背景与树木' } });

    // 点击生成
    const submitBtn = screen.getByRole('button', { name: /生成/ });
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        ratio: '16:9',
        scale: 1.5,
        prompt: '扩展两侧的森林背景与树木',
        model: expect.any(String),
        quality: expect.any(String),
      }),
    );
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('支持在扩图弹窗内切换模型与画质，并在提交时正确回传', () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <OutpaintModal
        isOpen={true}
        onClose={handleClose}
        imageUrl={mockImageUrl}
        onSubmitOutpaint={handleSubmit}
      />,
    );

    // 1. 打开模型切换菜单
    const modelBtn = screen.getByTitle('点击切换生图模型');
    fireEvent.click(modelBtn);
    expect(screen.getByText('生图模型配置')).toBeInTheDocument();

    // 2. 打开画质切换菜单
    const sizeBtn = screen.getByTitle('点击切换尺寸与分辨率');
    fireEvent.click(sizeBtn);
    expect(screen.getByText('清晰度 / 分辨率')).toBeInTheDocument();

    // 切换 1K 画质
    const quality1kBtn = screen.getByRole('button', { name: /^1K$/ });
    fireEvent.click(quality1kBtn);

    // 3. 点击生成
    const submitBtn = screen.getByRole('button', { name: /生成/ });
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        ratio: 'original',
        quality: 'low',
      }),
    );
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
