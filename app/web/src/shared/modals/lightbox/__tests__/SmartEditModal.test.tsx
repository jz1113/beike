// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { SmartEditModal } from '../SmartEditModal';

describe('SmartEditModal', () => {
  const mockImageUrl = 'https://example.com/character.png';

  beforeEach(() => {
    cleanup();
  });

  it('在 isOpen 为 false 时不渲染任何内容', () => {
    const { container } = render(
      <SmartEditModal
        isOpen={false}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        onSubmitSmartEdit={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('在 isOpen 为 true 时正确渲染标题、图片、框选与标记工具条与提示词输入框', () => {
    render(
      <SmartEditModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        originalPrompt="动漫原画群像"
        onSubmitSmartEdit={vi.fn()}
      />,
    );

    expect(screen.getByText('智能改图')).toBeInTheDocument();
    expect(screen.getByText('框选')).toBeInTheDocument();
    expect(screen.getByText('标记')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        '按住鼠标在图片上拖拽即可框选区域，描述修改需求，如：把框选区域的文字去掉...',
      ),
    ).toBeInTheDocument();
    // 渲染联动生图工作台的模型配置按钮
    expect(screen.getByTitle('点击切换生图模型')).toBeInTheDocument();
    // 渲染联动尺寸与分辨率按钮
    expect(screen.getByTitle('点击切换尺寸与分辨率')).toBeInTheDocument();
    expect(screen.getByText('生成')).toBeInTheDocument();
  });

  it('支持切换生图模型，并在提交时携带选中的模型与尺寸参数', () => {
    const handleSubmit = vi.fn();
    const handleClose = vi.fn();

    render(
      <SmartEditModal
        isOpen={true}
        onClose={handleClose}
        imageUrl={mockImageUrl}
        onSubmitSmartEdit={handleSubmit}
      />,
    );

    // 1. 点击打开模型切换下拉
    const modelBtn = screen.getByTitle('点击切换生图模型');
    fireEvent.click(modelBtn);

    // 确认下拉菜单展开
    expect(screen.getByText('生图模型配置')).toBeInTheDocument();

    // 2. 点击打开尺寸与分辨率下拉
    const sizeBtn = screen.getByTitle('点击切换尺寸与分辨率');
    fireEvent.click(sizeBtn);

    // 确认分辨率下拉展开
    expect(screen.getByText('清晰度 / 分辨率')).toBeInTheDocument();
    expect(screen.getByText('输出尺寸比例')).toBeInTheDocument();

    // 点击切换为 2K 画质
    const quality2kBtn = screen.getByRole('button', { name: /2K/ });
    fireEvent.click(quality2kBtn);

    // 点击切换为 1:1 比例
    const ratio11Btn = screen.getByRole('button', { name: '1:1' });
    fireEvent.click(ratio11Btn);

    // 3. 输入提示词
    const input = screen.getByPlaceholderText(
      '按住鼠标在图片上拖拽即可框选区域，描述修改需求，如：把框选区域的文字去掉...',
    );
    fireEvent.change(input, { target: { value: '把头发换成粉色，增加魔法光晕' } });

    // 4. 找到提交按钮并点击
    const submitBtn = screen.getByTitle('提交智能改图任务');
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        markers: expect.any(Array),
        prompt: '把头发换成粉色，增加魔法光晕',
        model: expect.any(String),
        quality: 'medium',
        aspectRatio: '1:1',
      }),
    );
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('在提示词为空时，禁用生成按钮且阻止提交', () => {
    const handleSubmit = vi.fn();
    render(
      <SmartEditModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        onSubmitSmartEdit={handleSubmit}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: '生成' });
    expect(submitBtn).toBeDisabled();

    fireEvent.click(submitBtn);
    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it('支持切换到标记模式，点击图片手动添加与删除标记点', () => {
    render(
      <SmartEditModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        originalPrompt="动漫原画群像"
        onSubmitSmartEdit={vi.fn()}
      />,
    );

    // 初始状态下不应存在删除标记点按钮或标记序号
    expect(screen.queryByTitle('删除此标记点')).not.toBeInTheDocument();

    // 切换到标记模式
    const pointModeBtn = screen.getByText('标记');
    fireEvent.click(pointModeBtn);

    // 点击图片容器添加标记点
    const img = screen.getByAltText('动漫原画群像');
    const imgContainer = img.parentElement!;
    
    // 模拟点击添加标记点
    fireEvent.click(imgContainer, { clientX: 100, clientY: 100 });

    // 此时图片上的标记气泡与输入框左侧缩略图胶囊中均应出现标记点 1
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByTitle('删除此标记点')).toBeInTheDocument();

    // 点击删除标记点
    fireEvent.click(screen.getByTitle('删除此标记点'));
    expect(screen.queryByTitle('删除此标记点')).not.toBeInTheDocument();
    expect(screen.queryAllByText('1')).toHaveLength(0);
  });

  it('默认支持框选模式，在图片上拖拽鼠标创建矩形选区并支持删除', () => {
    render(
      <SmartEditModal
        isOpen={true}
        onClose={vi.fn()}
        imageUrl={mockImageUrl}
        originalPrompt="动漫原画群像"
        onSubmitSmartEdit={vi.fn()}
      />,
    );

    const img = screen.getByAltText('动漫原画群像');
    const imgContainer = img.parentElement!;

    // 模拟容器宽高为 400x300，从 (50, 50) 拖拽到 (200, 150)
    imgContainer.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.mouseDown(imgContainer, { clientX: 50, clientY: 50 });
    fireEvent.mouseMove(imgContainer, { clientX: 200, clientY: 150 });
    fireEvent.mouseUp(window);

    // 出现选区 1
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTitle('删除此框选区域')).toBeInTheDocument();

    // 点击删除选区 1
    fireEvent.click(screen.getByTitle('删除此框选区域'));
    expect(screen.queryByTitle('删除此框选区域')).not.toBeInTheDocument();
  });
});
