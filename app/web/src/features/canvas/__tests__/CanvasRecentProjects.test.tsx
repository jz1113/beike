// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CanvasRecentProjects } from '../components/CanvasRecentProjects';
import { useCanvasStore } from '../store/useCanvasStore';

describe('CanvasRecentProjects Component', () => {
  afterEach(() => {
    cleanup();
  });
  beforeEach(() => {
    useCanvasStore.setState({
      projects: [
        {
          id: 'proj-1',
          title: '卓Zzz.X',
          updatedAt: Date.now() - 1000,
          createdAt: Date.now() - 2000,
          thumbnail: '',
          nodes: [],
        },
      ],
      activeProjectId: null,
    });
  });

  it('renders section title, count and project cards', () => {
    render(<CanvasRecentProjects />);

    expect(screen.getByText('最近项目')).not.toBeNull();
    expect(screen.getByText('1 个画布')).not.toBeNull();
    expect(screen.getByText('新建项目')).not.toBeNull();
    expect(screen.getByText('卓Zzz.X')).not.toBeNull();
  });

  it('triggers onEnterCanvas when clicking "新建项目"', () => {
    const handleEnter = vi.fn();
    render(<CanvasRecentProjects onEnterCanvas={handleEnter} />);

    const newBtn = screen.getByText('新建项目');
    fireEvent.click(newBtn);

    expect(handleEnter).toHaveBeenCalledTimes(1);
    expect(useCanvasStore.getState().projects.length).toBe(2);
  });

  it('triggers onEnterCanvas when clicking existing card', () => {
    const handleEnter = vi.fn();
    render(<CanvasRecentProjects onEnterCanvas={handleEnter} />);

    const cardTitle = screen.getByText('卓Zzz.X');
    fireEvent.click(cardTitle);

    expect(handleEnter).toHaveBeenCalledWith('proj-1');
    expect(useCanvasStore.getState().activeProjectId).toBe('proj-1');
  });

  it('supports renaming project', () => {
    render(<CanvasRecentProjects />);

    const moreBtn = screen.getByLabelText('项目更多选项');
    fireEvent.click(moreBtn);

    const renameBtn = screen.getByText('重命名');
    fireEvent.click(renameBtn);

    const input = screen.getByDisplayValue('卓Zzz.X');
    fireEvent.change(input, { target: { value: '重命名后的画布' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useCanvasStore.getState().projects[0].title).toBe('重命名后的画布');
  });

  it('supports deleting project', () => {
    render(<CanvasRecentProjects />);

    const moreBtn = screen.getByLabelText('项目更多选项');
    fireEvent.click(moreBtn);

    const deleteBtn = screen.getByText('删除');
    fireEvent.click(deleteBtn);

    expect(useCanvasStore.getState().projects.length).toBe(0);
  });

  it('limits displayed projects to maxDisplay (default 7) and shows "进入画板查看全部"', () => {
    // 模拟 10 个项目
    const tenProjects = Array.from({ length: 10 }).map((_, i) => ({
      id: `proj-${i + 1}`,
      title: `画布项目 ${i + 1}`,
      updatedAt: Date.now() - i * 1000,
      createdAt: Date.now() - i * 1000 - 1000,
      thumbnail: '',
      nodes: [],
    }));
    useCanvasStore.setState({ projects: tenProjects });

    render(<CanvasRecentProjects />);

    expect(screen.getByText('10 个画布')).not.toBeNull();
    expect(screen.getByText('进入画板查看全部')).not.toBeNull();
    // 默认展示前 7 个历史项目
    expect(screen.getByText('画布项目 1')).not.toBeNull();
    expect(screen.getByText('画布项目 7')).not.toBeNull();
    expect(screen.queryByText('画布项目 8')).toBeNull();
  });
});
