// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AIGeneratingCard from '../AIGeneratingCard';

describe('AIGeneratingCard (即梦原版浅天蓝柔光卡片与左上角进度标签)', () => {
  beforeEach(() => {
    cleanup();
  });

  it('当 showProgressBadge 为 true 时，在左上角正确渲染进度百分比', () => {
    render(
      <AIGeneratingCard
        task={{
          id: 'test-task-1',
          progress: '39%',
        }}
        showProgressBadge={true}
      />,
    );

    expect(screen.getByText('39%')).toBeInTheDocument();
  });

  it('支持根据数字 progressNumber 格式化百分比并在左上角显示', () => {
    render(
      <AIGeneratingCard
        task={{ id: 'test-task-2' }}
        progressNumber={75}
        showProgressBadge={true}
      />,
    );

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('当 showProgressBadge 为 false 时，不渲染左上角进度标签', () => {
    render(
      <AIGeneratingCard
        task={{
          id: 'test-task-3',
          progress: '39%',
        }}
        showProgressBadge={false}
      />,
    );

    expect(screen.queryByText('39%')).not.toBeInTheDocument();
  });
});
