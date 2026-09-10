// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CanvasLightingModal, { type LightingParams } from '../components/CanvasLightingModal';
import type { CanvasNode } from '../store/useCanvasStore';

describe('CanvasLightingModal (3D 打光效果控制弹窗)', () => {
  afterEach(() => {
    cleanup();
  });

  const mockNode: CanvasNode = {
    id: 'node-img-1',
    type: 'image',
    title: '新鲜车厘子海报',
    imageUrl: 'https://example.com/cherry.jpg',
    x: 100,
    y: 100,
    width: 240,
    height: 320,
    content: '新鲜采摘车厘子促销',
    status: 'idle',
    createdAt: Date.now(),
  };

  it('当 isOpen 为 false 时不渲染任何内容', () => {
    const { container } = render(
      <CanvasLightingModal
        isOpen={false}
        onClose={vi.fn()}
        node={mockNode}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('当 isOpen 为 true 时完整渲染打光弹窗的各项控制要素', () => {
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    // 标题
    expect(screen.getByText('打光效果')).toBeDefined();

    // 视图切换
    expect(screen.getByRole('button', { name: '透视' })).toBeDefined();
    expect(screen.getByRole('button', { name: '正面' })).toBeDefined();

    // 全局与智能模式
    expect(screen.getByText('全局')).toBeDefined();
    expect(screen.getByText('智能模式')).toBeDefined();

    // 亮度
    expect(screen.getByText('亮度')).toBeDefined();
    expect(screen.getByText(/50\s*%/)).toBeDefined();

    // 颜色
    expect(screen.getByText('颜色')).toBeDefined();

    // 主光源方位
    expect(screen.getByText('主光源')).toBeDefined();
    expect(screen.getByRole('button', { name: '左侧' })).toBeDefined();
    expect(screen.getByRole('button', { name: '顶部' })).toBeDefined();
    expect(screen.getByRole('button', { name: '右侧' })).toBeDefined();
    expect(screen.getByRole('button', { name: '前方' })).toBeDefined();
    expect(screen.getByRole('button', { name: '底部' })).toBeDefined();
    expect(screen.getByRole('button', { name: '后方' })).toBeDefined();

    // 轮廓光
    expect(screen.getByText('轮廓光')).toBeDefined();

    // 底栏功能
    expect(screen.getByText('重置参数')).toBeDefined();
    expect(screen.queryByText('14')).toBeNull(); // 已移除算力指示
    expect(screen.getByTitle('应用打光效果并生成')).toBeDefined();
  });

  it('支持在透视与正面视图之间自由切换', () => {
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    const perspectiveBtn = screen.getByRole('button', { name: '透视' });
    const frontBtn = screen.getByRole('button', { name: '正面' });

    // 默认透视为激活态
    expect(perspectiveBtn.className).toContain('bg-zinc-900');

    // 点击切换为正面视图
    fireEvent.click(frontBtn);
    expect(frontBtn.className).toContain('bg-zinc-900');

    // 再次点击切回透视
    fireEvent.click(perspectiveBtn);
    expect(perspectiveBtn.className).toContain('bg-zinc-900');
  });

  it('支持滑动调节亮度参数', () => {
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '85' } });

    expect(screen.getByText(/85\s*%/)).toBeDefined();
  });

  it('点击 6 方位主光源按钮可实时切换光源并高亮对应按钮', () => {
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    const topBtn = screen.getByRole('button', { name: '顶部' });
    const rightBtn = screen.getByRole('button', { name: '右侧' });
    const frontBtn = screen.getByRole('button', { name: '前方' });

    // 默认前方为高亮 (包含 bg-zinc-900)
    expect(frontBtn.className).toContain('bg-zinc-900');

    // 点击顶部
    fireEvent.click(topBtn);
    expect(topBtn.className).toContain('bg-zinc-900');
    expect(frontBtn.className).not.toContain('bg-zinc-900');

    // 点击右侧
    fireEvent.click(rightBtn);
    expect(rightBtn.className).toContain('bg-zinc-900');
  });

  it('支持切换智能模式和轮廓光开关', () => {
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    // 智能模式 Toggle
    const smartToggle = screen.getByRole('switch', { name: '智能模式开关' }) as HTMLInputElement;
    expect(smartToggle.checked).toBe(false);
    fireEvent.click(smartToggle);
    expect(smartToggle.checked).toBe(true);

    // 轮廓光 Toggle
    const rimToggle = screen.getByRole('switch', { name: '轮廓光开关' }) as HTMLInputElement;
    expect(rimToggle.checked).toBe(false);
    fireEvent.click(rimToggle);
    expect(rimToggle.checked).toBe(true);
  });

  it('点击重置参数按钮可将修改后的参数恢复至默认初值', () => {
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    // 更改亮度为 90
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '90' } });
    expect(screen.getByText(/90\s*%/)).toBeDefined();

    // 切换主光源为右侧
    const rightBtn = screen.getByRole('button', { name: '右侧' });
    fireEvent.click(rightBtn);
    expect(rightBtn.className).toContain('bg-zinc-900');

    // 点击重置
    const resetBtn = screen.getByRole('button', { name: '重置参数' });
    fireEvent.click(resetBtn);

    // 验证恢复至 50% 与前方
    expect(screen.getByText(/50\s*%/)).toBeDefined();
    const frontBtn = screen.getByRole('button', { name: '前方' });
    expect(frontBtn.className).toContain('bg-zinc-900');
  });

  it('点击右上角关闭按钮或遮罩可触发 onClose 回调', () => {
    const onClose = vi.fn();
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={onClose}
        node={mockNode}
      />
    );

    const closeBtn = screen.getByRole('button', { name: '关闭弹窗' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // 点击背景遮罩
    const backdrop = screen.getByTestId('lighting-modal-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('点击提交生成按钮可回调 onSubmit 并传递完整的打光参数配置', () => {
    const onSubmit = vi.fn();
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
        onSubmit={onSubmit}
      />
    );

    // 修改为顶部光，亮度 75%
    fireEvent.click(screen.getByRole('button', { name: '顶部' }));
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '75' } });

    // 提交
    const submitBtn = screen.getByTitle('应用打光效果并生成');
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedParams: LightingParams = onSubmit.mock.calls[0][0];
    expect(submittedParams.mainLight).toBe('top');
    expect(submittedParams.brightness).toBe(75);
    expect(submittedParams.viewMode).toBe('perspective');
  });

  it('正面打光模式下光源自适应居中下部(x:50, y:64)并在视角切换时平滑自适应', () => {
    const onSubmit = vi.fn();
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
        onSubmit={onSubmit}
      />
    );

    // 默认透视视角，前方光源在 x: 22, y: 70
    const frontViewBtn = screen.getByRole('button', { name: '正面' });
    fireEvent.click(frontViewBtn);

    // 此时提交，验证正面视角下的前方光源坐标为 { x: 50, y: 64 }
    const submitBtn = screen.getByTitle('应用打光效果并生成');
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const params: LightingParams = onSubmit.mock.calls[0][0];
    expect(params.viewMode).toBe('front');
    expect(params.mainLight).toBe('front');
    expect(params.lightCoords).toEqual({ x: 50, y: 64 });
  });

  it('底部控制栏成功渲染模型与画质比例切换工具栏，并在提交时透传模型配置', () => {
    const onSubmit = vi.fn();
    render(
      <CanvasLightingModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
        onSubmit={onSubmit}
      />
    );

    // 验证模型与画质胶囊正常渲染
    const modelBtn = screen.getByText(/GPT Image 2/i);
    expect(modelBtn).toBeDefined();

    // 点击提交
    const submitBtn = screen.getByTitle('应用打光效果并生成');
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submittedParams: LightingParams = onSubmit.mock.calls[0][0];
    const options = onSubmit.mock.calls[0][1];
    expect(submittedParams.model).toBeDefined();
    expect(options?.model).toBe(submittedParams.model);
  });
});

