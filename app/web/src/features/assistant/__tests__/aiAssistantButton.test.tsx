// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AIAssistantButton from '../AIAssistantButton';
import { useAppStore } from '@/store/useAppStore';

describe('AIAssistantButton 悬浮助手组件测试', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({ isAssistantOpen: false });
  });

  afterEach(() => {
    cleanup();
  });

  it('默认状态下稳定渲染，拥有纯透明原生 Logo 与无障碍标签', () => {
    render(<AIAssistantButton />);

    const btn = screen.getByTestId('ai-assistant-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label', '打开贝壳云图 AI 助手');
    expect(btn).not.toHaveTextContent('贝壳云图 AI 助手');
    expect(btn).not.toHaveAttribute('title');

    const logoImg = screen.getByAltText('贝壳云图 AI 助手');
    expect(logoImg).toBeInTheDocument();
    expect(logoImg).toHaveAttribute('src', '/app_logo.png');
  });

  it('点击悬浮球能够正确触发 setIsAssistantOpen(true)', () => {
    render(<AIAssistantButton />);

    const btn = screen.getByTestId('ai-assistant-button');
    fireEvent.click(btn);

    expect(useAppStore.getState().isAssistantOpen).toBe(true);
  });

  it('当图片加载失败时，自动优雅降级展示 Sparkles 矢量图标兜底，绝不隐形', () => {
    render(<AIAssistantButton />);

    const logoImg = screen.getByAltText('贝壳云图 AI 助手');
    fireEvent.error(logoImg);

    // 图片卸载，替换为容错矢量图标容器
    expect(screen.queryByAltText('贝壳云图 AI 助手')).not.toBeInTheDocument();
    const fallbackIcon = screen.getByTestId('ai-assistant-fallback-icon');
    expect(fallbackIcon).toBeInTheDocument();
  });

  it('当 isAssistantOpen 为 true 时，悬浮按钮自动隐蔽返回 null', () => {
    useAppStore.setState({ isAssistantOpen: true });
    const { container } = render(<AIAssistantButton />);

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('ai-assistant-button')).not.toBeInTheDocument();
  });
});
