// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import CanvasMultiAngleModal, { type MultiAngleParams } from '../components/CanvasMultiAngleModal';
import type { CanvasNode } from '../store/useCanvasStore';

describe('CanvasMultiAngleModal (多角度编辑器弹窗)', () => {
  afterEach(() => {
    cleanup();
  });

  const mockNode: CanvasNode = {
    id: 'node-cherry-1',
    type: 'image',
    title: '信发樱桃海报',
    imageUrl: 'https://example.com/cherry.png',
    x: 200,
    y: 200,
    width: 280,
    height: 380,
    content: '信发樱桃，脆爽清甜',
    status: 'idle',
    createdAt: Date.now(),
  };

  it('当 isOpen 为 false 或 node 为 null 时不渲染内容', () => {
    const { container: c1 } = render(
      <CanvasMultiAngleModal
        isOpen={false}
        onClose={vi.fn()}
        node={mockNode}
      />
    );
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={null}
      />
    );
    expect(c2.firstChild).toBeNull();
  });

  it('当 isOpen 为 true 时完整渲染标题、7个预设Tab、微调按钮、滑块与底栏', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    // 标题
    expect(screen.getByText('多角度编辑器')).toBeDefined();

    // 7 个预设 Tab
    const expectedTabs = [
      '自定义',
      '鱼眼视角',
      '倾斜视角',
      '正面俯拍',
      '正面仰拍',
      '全景俯拍',
      '背面视角',
    ];
    for (const tab of expectedTabs) {
      expect(screen.getByRole('button', { name: tab })).toBeDefined();
    }

    // 4 个微调按钮
    expect(screen.getByRole('button', { name: '向上微调' })).toBeDefined();
    expect(screen.getByRole('button', { name: '向下微调' })).toBeDefined();
    expect(screen.getByRole('button', { name: '向左微调' })).toBeDefined();
    expect(screen.getByRole('button', { name: '向右微调' })).toBeDefined();

    // 3 个滑块与提示词
    expect(screen.getByLabelText('水平环绕')).toBeDefined();
    expect(screen.getByLabelText('垂直俯仰')).toBeDefined();
    expect(screen.getByLabelText('景别缩放')).toBeDefined();
    expect(screen.getByLabelText('提示词开关')).toBeDefined();

    // 底部工具栏
    expect(screen.getByText('重置参数')).toBeDefined();
    expect(screen.queryByText('14')).toBeNull(); // 已移除算力指示
    expect(screen.getByTitle('应用多角度效果并生成')).toBeDefined();
  });

  it('图1状态：默认自定义视角，水平0°、垂直0°、中景、提示词关闭', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    const customTab = screen.getByRole('button', { name: '自定义' });
    expect(customTab.className).toContain('text-white');

    const azSlider = screen.getByLabelText('水平环绕') as HTMLInputElement;
    const elSlider = screen.getByLabelText('垂直俯仰') as HTMLInputElement;
    const promptSwitch = screen.getByLabelText('提示词开关') as HTMLInputElement;

    expect(azSlider.value).toBe('0');
    expect(elSlider.value).toBe('0');
    expect(screen.getByText('中景')).toBeDefined();
    expect(promptSwitch.checked).toBe(false);
    expect(screen.queryByLabelText('提示词输入框')).toBeNull();
  });

  it('图2状态：点击“鱼眼视角”，参数联动为水平0°、垂直30°、特写、提示词开启且内容正确', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '鱼眼视角' }));

    const azSlider = screen.getByLabelText('水平环绕') as HTMLInputElement;
    const elSlider = screen.getByLabelText('垂直俯仰') as HTMLInputElement;
    const promptSwitch = screen.getByLabelText('提示词开关') as HTMLInputElement;

    expect(azSlider.value).toBe('0');
    expect(elSlider.value).toBe('30');
    expect(screen.getByText('特写')).toBeDefined();
    expect(promptSwitch.checked).toBe(true);

    const textarea = screen.getByLabelText('提示词输入框') as HTMLTextAreaElement;
    expect(textarea.value).toBe('极度特写镜头，广角镜头，边缘带有鱼眼畸变效果');
  });

  it('图3状态：点击“倾斜视角”，参数联动为水平45°、垂直-30°、中景、提示词开启且内容正确', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '倾斜视角' }));

    const azSlider = screen.getByLabelText('水平环绕') as HTMLInputElement;
    const elSlider = screen.getByLabelText('垂直俯仰') as HTMLInputElement;
    const promptSwitch = screen.getByLabelText('提示词开关') as HTMLInputElement;

    expect(azSlider.value).toBe('45');
    expect(elSlider.value).toBe('-30');
    expect(screen.getByText('中景')).toBeDefined();
    expect(promptSwitch.checked).toBe(true);

    const textarea = screen.getByLabelText('提示词输入框') as HTMLTextAreaElement;
    expect(textarea.value).toBe('dutch angle，tilted frame');
  });

  it('图4状态：点击“正面俯拍”，参数联动为水平0°、垂直60°、中景、提示词关闭', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '正面俯拍' }));

    const azSlider = screen.getByLabelText('水平环绕') as HTMLInputElement;
    const elSlider = screen.getByLabelText('垂直俯仰') as HTMLInputElement;
    const promptSwitch = screen.getByLabelText('提示词开关') as HTMLInputElement;

    expect(azSlider.value).toBe('0');
    expect(elSlider.value).toBe('60');
    expect(screen.getByText('中景')).toBeDefined();
    expect(promptSwitch.checked).toBe(false);
  });

  it('图5状态：点击“正面仰拍”，参数联动为水平0°、垂直-30°、中景、提示词关闭', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '正面仰拍' }));

    const azSlider = screen.getByLabelText('水平环绕') as HTMLInputElement;
    const elSlider = screen.getByLabelText('垂直俯仰') as HTMLInputElement;
    const promptSwitch = screen.getByLabelText('提示词开关') as HTMLInputElement;

    expect(azSlider.value).toBe('0');
    expect(elSlider.value).toBe('-30');
    expect(screen.getByText('中景')).toBeDefined();
    expect(promptSwitch.checked).toBe(false);
  });

  it('全景俯拍（第二轮图1状态）：点击“全景俯拍”，参数联动为水平45°、垂直30°、全景、提示词关闭', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '全景俯拍' }));
    expect((screen.getByLabelText('水平环绕') as HTMLInputElement).value).toBe('45');
    expect((screen.getByLabelText('垂直俯仰') as HTMLInputElement).value).toBe('30');
    expect(screen.getByText('全景')).toBeDefined();
    expect((screen.getByLabelText('提示词开关') as HTMLInputElement).checked).toBe(false);
  });

  it('背面视角（第二轮图2状态）：点击“背面视角”，参数联动为水平180°、垂直0°、中景、提示词关闭', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '背面视角' }));
    expect((screen.getByLabelText('水平环绕') as HTMLInputElement).value).toBe('180');
    expect((screen.getByLabelText('垂直俯仰') as HTMLInputElement).value).toBe('0');
    expect(screen.getByText('中景')).toBeDefined();
    expect((screen.getByLabelText('提示词开关') as HTMLInputElement).checked).toBe(false);
  });

  it('四方向微调箭头可增减角度并切回自定义模式', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    // 向上微调（俯仰 +15°）
    fireEvent.click(screen.getByRole('button', { name: '向上微调' }));
    expect((screen.getByLabelText('垂直俯仰') as HTMLInputElement).value).toBe('15');

    // 向右微调（水平 +15°）
    fireEvent.click(screen.getByRole('button', { name: '向右微调' }));
    expect((screen.getByLabelText('水平环绕') as HTMLInputElement).value).toBe('15');

    // 向下微调（俯仰 -15°）
    fireEvent.click(screen.getByRole('button', { name: '向下微调' }));
    expect((screen.getByLabelText('垂直俯仰') as HTMLInputElement).value).toBe('0');

    // 向左微调（水平 -15°，由于从 15° 减 15° 回到 0°）
    fireEvent.click(screen.getByRole('button', { name: '向左微调' }));
    expect((screen.getByLabelText('水平环绕') as HTMLInputElement).value).toBe('0');
  });

  it('手动调节滑块与修改提示词', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    // 改变水平环绕滑块为 90
    const azSlider = screen.getByLabelText('水平环绕');
    fireEvent.change(azSlider, { target: { value: '90' } });
    expect((azSlider as HTMLInputElement).value).toBe('90');

    // 改变垂直俯仰滑块为 -45
    const elSlider = screen.getByLabelText('垂直俯仰');
    fireEvent.change(elSlider, { target: { value: '-45' } });
    expect((elSlider as HTMLInputElement).value).toBe('-45');

    // 开启提示词并输入自定义文本
    const promptSwitch = screen.getByLabelText('提示词开关');
    fireEvent.click(promptSwitch);
    const textarea = screen.getByLabelText('提示词输入框');
    fireEvent.change(textarea, { target: { value: '电影感宽银幕，45度侧光' } });
    expect((textarea as HTMLTextAreaElement).value).toBe('电影感宽银幕，45度侧光');
  });

  it('重置参数按钮能将所有参数还原为初始状态', () => {
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
      />
    );

    // 切换到鱼眼视角
    fireEvent.click(screen.getByRole('button', { name: '鱼眼视角' }));
    expect((screen.getByLabelText('垂直俯仰') as HTMLInputElement).value).toBe('30');

    // 点击重置参数
    fireEvent.click(screen.getByText('重置参数'));
    expect((screen.getByLabelText('水平环绕') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('垂直俯仰') as HTMLInputElement).value).toBe('0');
    expect(screen.getByText('中景')).toBeDefined();
    expect((screen.getByLabelText('提示词开关') as HTMLInputElement).checked).toBe(false);
  });

  it('点击生成按钮调用 onSubmit 并传递完整的视角参数', () => {
    const handleSubmit = vi.fn();
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
        onSubmit={handleSubmit}
      />
    );

    // 选择倾斜视角
    fireEvent.click(screen.getByRole('button', { name: '倾斜视角' }));

    // 点击生成提交按钮
    const submitBtn = screen.getByTitle('应用多角度效果并生成');
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submittedParams: MultiAngleParams = handleSubmit.mock.calls[0][0];
    expect(submittedParams.preset).toBe('tilted');
    expect(submittedParams.azimuth).toBe(45);
    expect(submittedParams.elevation).toBe(-30);
    expect(submittedParams.shotScale).toBe('中景');
    expect(submittedParams.promptEnabled).toBe(true);
    expect(submittedParams.prompt).toBe('dutch angle，tilted frame');
  });

  it('点击关闭按钮或遮罩层触发 onClose', () => {
    const handleClose = vi.fn();
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={handleClose}
        node={mockNode}
      />
    );

    // 点击右上角叉叉
    fireEvent.click(screen.getByLabelText('关闭弹窗'));
    expect(handleClose).toHaveBeenCalledTimes(1);

    // 点击背景遮罩
    fireEvent.click(screen.getByTestId('multi-angle-modal-backdrop'));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it('底部控制栏成功渲染模型与画质比例切换工具栏，并在提交时透传模型配置', () => {
    const handleSubmit = vi.fn();
    render(
      <CanvasMultiAngleModal
        isOpen={true}
        onClose={vi.fn()}
        node={mockNode}
        onSubmit={handleSubmit}
      />
    );

    // 验证模型胶囊正常渲染
    const modelBtn = screen.getByText(/GPT Image 2/i);
    expect(modelBtn).toBeDefined();

    // 点击提交
    const submitBtn = screen.getByTitle('应用多角度效果并生成');
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    const submittedParams: MultiAngleParams = handleSubmit.mock.calls[0][0];
    const options = handleSubmit.mock.calls[0][1];
    expect(submittedParams.model).toBeDefined();
    expect(options?.model).toBe(submittedParams.model);
  });
});

