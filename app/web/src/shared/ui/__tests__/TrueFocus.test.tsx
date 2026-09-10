// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TrueFocus } from '../TrueFocus';

describe('TrueFocus 动画组件', () => {
  beforeEach(() => {
    cleanup();
  });
  it('正确渲染传入的词语列表和对焦框结构', () => {
    render(
      <TrueFocus
        sentence="贝 壳 云 图"
        separator=" "
        manualMode={false}
        blurAmount={4.5}
        borderColor="#ff4627"
        animationDuration={0.5}
        pauseBetweenAnimations={1}
      />,
    );

    // 验证四个字均正确被拆分渲染为 focus-word
    expect(screen.getByText('贝')).toBeInTheDocument();
    expect(screen.getByText('壳')).toBeInTheDocument();
    expect(screen.getByText('云')).toBeInTheDocument();
    expect(screen.getByText('图')).toBeInTheDocument();

    // 验证对焦框的 4 个直角 corner 节点存在
    const corners = document.querySelectorAll('.corner');
    expect(corners.length).toBe(4);
  });

  it('首个词默认处于激活态', () => {
    render(
      <TrueFocus
        sentence="贝 壳 云 图"
        separator=" "
      />,
    );

    const firstWord = screen.getByText('贝');
    expect(firstWord).toHaveClass('active');
  });

  it('支持双字词聚焦动画（如 贝壳 云图），每次聚焦两个字', () => {
    render(
      <TrueFocus
        sentence="贝壳 云图"
        separator=" "
      />,
    );

    // 验证每次两个字作为独立词元
    const firstWord = screen.getByText('贝壳');
    const secondWord = screen.getByText('云图');
    expect(firstWord).toBeInTheDocument();
    expect(secondWord).toBeInTheDocument();

    // 首个双字词处于激活聚焦状态
    expect(firstWord).toHaveClass('active');
    expect(secondWord).not.toHaveClass('active');
  });
});
