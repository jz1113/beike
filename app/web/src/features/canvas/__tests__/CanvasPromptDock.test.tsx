// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import CanvasPromptDock from '../components/CanvasPromptDock';
import { useAppStore } from '@/store/useAppStore';

describe('CanvasPromptDock 画板输入控制舱（对齐主页功能框标准）', () => {
  beforeEach(() => {
    cleanup();
    localStorage.setItem(
      'custom_models',
      JSON.stringify([
        {
          id: 'gpt-image-2',
          name: 'GPT Image 2',
          isImage: true,
          enabled: true,
        },
      ])
    );
    useAppStore.setState({
      currentView: 'canvas',
      quickPrompt: '',
      quickRefImages: [],
      quickVideoFirstFrame: null,
      quickVideoLastFrame: null,
      quickVideoMultiFrames: [],
      quickGenMode: 'image',
      quickModel: 'gpt-image-2',
      quickVideoModel: 'seedance-2.0-mini',
    });
  });

  it('参考主页功能框，绝不包含乱改的“自动”、“灵感搜索”、“创意设计”等非标按钮', () => {
    render(<CanvasPromptDock onSubmit={vi.fn()} />);

    // 严禁存在非标杂项按钮
    expect(screen.queryByText('自动')).toBeNull();
    expect(screen.queryByText('灵感搜索')).toBeNull();
    expect(screen.queryByText('创意设计')).toBeNull();
  });

  it('常态下呈现画布胶囊药丸条，聚焦展开后包含主页标准的图片生成模式切换与控制栏', () => {
    const { container } = render(<CanvasPromptDock onSubmit={vi.fn()} />);

    // 常态下有微型上传卡片（带 title="上传参考素材"）
    const uploadBtn = screen.getByTitle('上传参考素材');
    expect(uploadBtn).toBeInTheDocument();

    // 聚焦输入框
    const input = container.querySelector('.rich-mention-contenteditable');
    expect(input).toBeInTheDocument();
    fireEvent.focus(input!);

    // 展开后应包含主页同款的标准模式切换按钮（图片生成）
    expect(screen.getByText('图片生成')).toBeInTheDocument();
  });

  it('响应外部节点 mentionTrigger 触发，自动注入 @主体 并将素材设为参考图', () => {
    const { rerender } = render(
      <CanvasPromptDock
        onSubmit={vi.fn()}
        mentionTrigger={null}
      />
    );

    rerender(
      <CanvasPromptDock
        onSubmit={vi.fn()}
        mentionTrigger={{
          name: '产品主图特写',
          url: 'https://example.com/product.jpg',
          timestamp: Date.now(),
        }}
      />
    );

    // 验证 store 中自动追加了 @产品主图特写 并且参考素材被添加
    const state = useAppStore.getState();
    expect(state.quickPrompt).toContain('@产品主图特写');
    expect(state.quickRefImages).toContain('https://example.com/product.jpg');
  });

  it('视频引用使用视频模式，保留提示词且不添加到助手', () => {
    useAppStore.setState({ quickPrompt: '继续创作' });
    render(<CanvasPromptDock mentionTrigger={{name:'视频',url:'https://example.com/clip.mp4',type:'video',timestamp:1,attachOnly:true}} />);
    expect(useAppStore.getState().quickGenMode).toBe('video');
    expect(useAppStore.getState().quickVideoRefMode).toBe('omni');
    expect(useAppStore.getState().quickPrompt).toBe('继续创作');
    expect(useAppStore.getState().quickRefImages).toContain('https://example.com/clip.mp4');
  });

  it('提交时调用 onSubmit 回调在画布中生成节点', () => {
    const handleSubmit = vi.fn();
    useAppStore.setState({
      quickPrompt: '未来赛博风光',
      quickGenMode: 'video',
      quickVideoModel: 'seedance-2.0-mini',
    });

    render(<CanvasPromptDock onSubmit={handleSubmit} />);

    // 点击发送按钮
    const sendBtn = screen.getByTitle('开始生成视频');
    fireEvent.click(sendBtn);

    expect(handleSubmit).toHaveBeenCalledWith(
      '未来赛博风光',
      undefined,
      'video',
      expect.any(Array)
    );
  });
});
