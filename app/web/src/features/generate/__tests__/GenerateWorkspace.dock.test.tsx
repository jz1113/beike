// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import GenerateWorkspace from '../GenerateWorkspace';
import { useAppStore } from '@/store/useAppStore';

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.ResizeObserver = MockResizeObserver as any;

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.IntersectionObserver = MockIntersectionObserver as any;

describe('GenerateWorkspace 底部吸底控制栏画布常态折叠展开测试', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      currentView: 'generate',
      sessions: [
        {
          id: 'sess-1',
          title: '默认会话',
          createdAt: Date.now(),
          tasks: [],
        },
      ],
      currentSessionId: 'sess-1',
      quickPrompt: '',
      quickRefImages: [],
      quickVideoFirstFrame: null,
      quickVideoLastFrame: null,
      quickVideoMultiFrames: [],
      quickGenMode: 'image',
    });
  });

  it('初始常态且无输入时，底部 Dock 容器宽度为紧凑的 max-w-[560px] 胶囊结构', () => {
    const { container } = render(<GenerateWorkspace />);

    // 查找包含 promptDockRef 的容器内部 wrapper
    const dockWrapper = container.querySelector('.pointer-events-auto.min-w-0.overflow-visible');
    expect(dockWrapper).toBeTruthy();
    expect(dockWrapper?.className).toContain('max-w-[560px]');
    expect(dockWrapper?.className).not.toContain('max-w-5xl');

    // 页面内应呈现常态上传微卡片
    const miniUploadBtn = container.querySelector('button[title="上传参考素材"]');
    expect(miniUploadBtn).toBeTruthy();
  });

  it('当用户聚焦输入框时，底部 Dock 容器宽度自适应平滑展开为 max-w-5xl 完整控制台', () => {
    const { container } = render(<GenerateWorkspace />);

    const dockWrapper = container.querySelector('.pointer-events-auto.min-w-0.overflow-visible');
    expect(dockWrapper?.className).toContain('max-w-[560px]');

    const input = container.querySelector('.rich-mention-contenteditable')!;
    expect(input).toBeTruthy();
    fireEvent.focus(input);

    // 聚焦后展开为 max-w-5xl
    expect(dockWrapper?.className).toContain('max-w-5xl');
  });

  it('当 store 中存在提示词内容时，底部 Dock 自动展开并保持全宽控制台', () => {
    useAppStore.setState({
      quickPrompt: '美丽的山水风光',
    });

    const { container } = render(<GenerateWorkspace />);

    const dockWrapper = container.querySelector('.pointer-events-auto.min-w-0.overflow-visible');
    expect(dockWrapper?.className).toContain('max-w-5xl');
  });
});
