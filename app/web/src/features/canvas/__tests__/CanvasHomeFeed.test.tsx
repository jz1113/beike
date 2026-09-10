// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { CanvasHomeFeed } from '../components/CanvasHomeFeed';
import { useCanvasStore } from '../store/useCanvasStore';

// Mock PromptActionBar 简化渲染
vi.mock('@/features/home/components/prompt-bar/PromptActionBar', () => ({
  default: () => <div data-testid="mock-prompt-action-bar">PromptActionBar</div>,
}));

describe('CanvasHomeFeed 画布首页信息流与项目卡片', () => {
  beforeEach(() => {
    cleanup();
    // 重置 store 初始状态
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-project-1',
          title: '我的作品',
          subtitle: '画布 · 1分钟前修改',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          nodes: [],
        },
      ],
      activeProjectId: null,
    });
  });

  it('渲染大标题、新建项目卡片和最近项目卡片', () => {
    render(<CanvasHomeFeed />);

    expect(screen.getByText('今天想在无限画布创作什么？')).toBeInTheDocument();
    expect(screen.getByText('新建项目')).toBeInTheDocument();
    expect(screen.getByText('我的作品')).toBeInTheDocument();
    expect(screen.getByText('画布 · 1分钟前修改')).toBeInTheDocument();

    // 确保没有出现居中“打开画布”胶囊遮挡预览图
    expect(screen.queryByText('打开画布')).not.toBeInTheDocument();
  });

  it('点击标题右侧三点按钮可展开下拉菜单，显示“重命名”和“删除”', () => {
    render(<CanvasHomeFeed />);

    const moreBtn = screen.getByTitle('更多操作');
    expect(moreBtn).toBeInTheDocument();

    // 初始状态下拉菜单不显示
    expect(screen.queryByText('重命名')).not.toBeInTheDocument();
    expect(screen.queryByText('删除')).not.toBeInTheDocument();

    // 点击三点按钮展开菜单
    fireEvent.click(moreBtn);

    expect(screen.getByText('重命名')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('点击删除菜单项可删除对应项目', () => {
    render(<CanvasHomeFeed />);

    const moreBtn = screen.getByTitle('更多操作');
    fireEvent.click(moreBtn);

    const deleteBtn = screen.getByText('删除');
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('我的作品')).not.toBeInTheDocument();
    expect(useCanvasStore.getState().projects).toHaveLength(0);
  });

  it('点击重命名可修改项目标题并保存', () => {
    render(<CanvasHomeFeed />);

    const moreBtn = screen.getByTitle('更多操作');
    fireEvent.click(moreBtn);

    const renameBtn = screen.getByText('重命名');
    fireEvent.click(renameBtn);

    // 出现重命名输入框
    const input = screen.getByDisplayValue('我的作品');
    fireEvent.change(input, { target: { value: '我的海报设计' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('我的海报设计')).toBeInTheDocument();
    expect(useCanvasStore.getState().projects[0].title).toBe('我的海报设计');
  });

  it('点击卡片本身触发 selectProject 进入画布', () => {
    render(<CanvasHomeFeed />);

    const cardTitle = screen.getByText('我的作品');
    fireEvent.click(cardTitle);

    expect(useCanvasStore.getState().activeProjectId).toBe('test-project-1');
  });

  it('点击页面外部可自动收起操作菜单', () => {
    render(<CanvasHomeFeed />);

    const moreBtn = screen.getByTitle('更多操作');
    fireEvent.click(moreBtn);
    expect(screen.getByText('重命名')).toBeInTheDocument();

    // 点击页面空白处
    fireEvent.click(window);
    expect(screen.queryByText('重命名')).not.toBeInTheDocument();
  });
});
