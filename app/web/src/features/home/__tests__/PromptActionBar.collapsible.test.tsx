// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import PromptActionBar from '../components/prompt-bar/PromptActionBar';
import { useAppStore } from '@/store/useAppStore';

describe('PromptActionBar 常态折叠与展开交互测试', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      quickPrompt: '',
      quickRefImages: [],
      quickVideoFirstFrame: null,
      quickVideoLastFrame: null,
      quickVideoMultiFrames: [],
      quickGenMode: 'image',
    });
  });

  it('未配置 collapsible 或 collapsible 为 false 时，默认保持展开态并渲染参数控制栏', () => {
    render(<PromptActionBar collapsible={false} />);
    // 展开态下应该能看到图片生成的模式切换按钮或参数行
    expect(screen.getByText('图片生成')).toBeTruthy();
  });

  it('配置 collapsible={true} 且无内容时，应呈现画布常态胶囊条', () => {
    const handleExpandChange = vi.fn();
    const { container } = render(
      <PromptActionBar
        collapsible={true}
        onExpandChange={handleExpandChange}
      />
    );

    // 常态下有上传微卡片（通过 title 找到）
    const uploadBtn = screen.getByTitle('上传参考素材');
    expect(uploadBtn).toBeTruthy();

    // 常态下单行输入框渲染
    const singleInput = container.querySelector('.rich-mention-contenteditable');
    expect(singleInput).toBeTruthy();

    // 参数控制行不在折叠态中展示
    expect(screen.queryByText('图片生成')).toBeNull();

    // onExpandChange 应被调用为 false
    expect(handleExpandChange).toHaveBeenCalledWith(false);
  });

  it('折叠态下当输入框获得焦点或聚焦时，应自动展开为完整面板', () => {
    const handleExpandChange = vi.fn();
    const { container } = render(
      <PromptActionBar
        collapsible={true}
        onExpandChange={handleExpandChange}
      />
    );

    const input = container.querySelector('.rich-mention-contenteditable')!;
    expect(input).toBeTruthy();
    fireEvent.focus(input);

    // 聚焦后展开，应出现参数控制栏
    expect(screen.getByText('图片生成')).toBeTruthy();
    expect(handleExpandChange).toHaveBeenCalledWith(true);
  });

  it('折叠态下当 store 中存在提示词内容时，自动保持展开态', () => {
    useAppStore.setState({
      quickPrompt: '赛博朋克城市风景',
    });

    const handleExpandChange = vi.fn();
    render(
      <PromptActionBar
        collapsible={true}
        onExpandChange={handleExpandChange}
      />
    );

    // 有内容直接展开
    expect(screen.getByText('图片生成')).toBeTruthy();
    expect(handleExpandChange).toHaveBeenCalledWith(true);
  });
});
