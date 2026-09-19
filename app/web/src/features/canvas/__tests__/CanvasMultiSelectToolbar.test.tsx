// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { CanvasMultiSelectToolbar } from '../components/CanvasMultiSelectToolbar';
import type { CanvasNode } from '../types';
import { useCanvasStore } from '../store/useCanvasStore';

vi.mock('@/lib/downloadMedia', () => ({
  downloadMediaOrOpen: vi.fn().mockResolvedValue(undefined),
}));

describe('CanvasMultiSelectToolbar', () => {
  const sampleNodes: CanvasNode[] = [
    {
      id: 'node-1',
      type: 'image',
      title: '图片 1',
      imageUrl: 'https://example.com/img1.png',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      createdAt: 1,
    },
    {
      id: 'node-2',
      type: 'image',
      title: '图片 2',
      imageUrl: 'https://example.com/img2.png',
      x: 350,
      y: 100,
      width: 200,
      height: 200,
      createdAt: 2,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('选中节点小于2个时不渲染任何工具栏', () => {
    const { container } = render(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={[sampleNodes[0]]}
        zoom={1}
        onClearSelection={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('选中2个及以上节点时正确渲染多选包围框与工具栏', () => {
    render(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={sampleNodes}
        zoom={1}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByTestId('canvas-multiselect-bounding-box')).toBeTruthy();
    expect(screen.getByTestId('canvas-multiselect-toolbar')).toBeTruthy();
    expect(screen.getByRole('button', { name: '整理' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '成组' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '折叠' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '批量下载选中的图片/视频/音频节点' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '添加到对话' })).toBeTruthy();
  });

  it('点击退出多选按钮调用 onClearSelection', () => {
    const onClear = vi.fn();
    render(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={sampleNodes}
        zoom={1}
        onClearSelection={onClear}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '退出多选' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('点击整理弹出菜单并支持水平排列与垂直排列与宫格排列', () => {
    const patchNodesSpy = vi.spyOn(useCanvasStore.getState(), 'patchNodes');

    render(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={sampleNodes}
        zoom={1}
        onClearSelection={vi.fn()}
      />
    );

    const organizeBtn = screen.getByRole('button', { name: '整理' });
    fireEvent.click(organizeBtn);

    // 应该出现宫格排列、水平排列、垂直排列
    expect(screen.getByText('宫格排列')).toBeTruthy();
    expect(screen.getByText('水平排列')).toBeTruthy();
    expect(screen.getByText('垂直排列')).toBeTruthy();

    // 点击水平排列
    fireEvent.click(screen.getByText('水平排列'));
    expect(patchNodesSpy).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        'node-1': expect.objectContaining({ x: 100, y: 100 }),
        'node-2': expect.objectContaining({ x: 316, y: 100 }), // 100 + 200 + 16
      })
    );

    // 再次点击整理并选择垂直排列
    fireEvent.click(organizeBtn);
    fireEvent.click(screen.getByText('垂直排列'));
    expect(patchNodesSpy).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        'node-1': expect.objectContaining({ x: 100, y: 100 }),
        'node-2': expect.objectContaining({ x: 100, y: 316 }), // 100 + 200 + 16
      })
    );

    // 再次点击整理并选择宫格排列
    fireEvent.click(organizeBtn);
    fireEvent.click(screen.getByText('宫格排列'));
    expect(patchNodesSpy).toHaveBeenCalledWith('project-1', expect.any(Object));
  });

  it('成组功能：点击成组赋予相同 groupId，再次点击解除成组', () => {
    const patchNodesSpy = vi.spyOn(useCanvasStore.getState(), 'patchNodes');

    const { rerender } = render(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={sampleNodes}
        zoom={1}
        onClearSelection={vi.fn()}
      />
    );

    // 初始状态显示成组
    const groupBtn = screen.getByRole('button', { name: '成组' });
    fireEvent.click(groupBtn);

    expect(patchNodesSpy).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        'node-1': expect.objectContaining({ groupId: expect.any(String) }),
        'node-2': expect.objectContaining({ groupId: expect.any(String) }),
      })
    );

    // 模拟已经是成组状态
    const groupedNodes: CanvasNode[] = sampleNodes.map((n) => ({
      ...n,
      groupId: 'test-group-id',
    }));

    rerender(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={groupedNodes}
        zoom={1}
        onClearSelection={vi.fn()}
      />
    );

    const ungroupBtn = screen.getByRole('button', { name: '解除成组' });
    fireEvent.click(ungroupBtn);

    expect(patchNodesSpy).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        'node-1': expect.objectContaining({ groupId: undefined }),
        'node-2': expect.objectContaining({ groupId: undefined }),
      })
    );
  });

  it('折叠与展开功能：点击折叠保留主节点收起其他节点，再次点击展开恢复', () => {
    const patchNodesSpy = vi.spyOn(useCanvasStore.getState(), 'patchNodes');

    const { rerender } = render(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={sampleNodes}
        zoom={1}
        onClearSelection={vi.fn()}
      />
    );

    const foldBtn = screen.getByRole('button', { name: '折叠' });
    fireEvent.click(foldBtn);

    expect(patchNodesSpy).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        'node-1': expect.objectContaining({
          isFoldLeader: true,
          foldedCount: 2,
        }),
        'node-2': expect.objectContaining({
          foldedInGroupId: 'node-1',
        }),
      })
    );

    // 模拟已经折叠状态
    const foldedNodes: CanvasNode[] = [
      { ...sampleNodes[0], isFoldLeader: true, foldedCount: 2, groupId: 'grp-1' },
      { ...sampleNodes[1], foldedInGroupId: 'node-1', groupId: 'grp-1' },
    ];

    rerender(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={foldedNodes}
        allNodes={foldedNodes}
        zoom={1}
        onClearSelection={vi.fn()}
      />
    );

    const unfoldBtn = screen.getByRole('button', { name: '展开' });
    fireEvent.click(unfoldBtn);

    expect(patchNodesSpy).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({
        'node-1': expect.objectContaining({ isFoldLeader: false }),
        'node-2': expect.objectContaining({ foldedInGroupId: undefined }),
      })
    );
  });

  it('点击批量下载触发下载', () => {
    vi.useFakeTimers();
    render(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={sampleNodes}
        zoom={1}
        onClearSelection={vi.fn()}
      />
    );

    const downloadBtn = screen.getByRole('button', { name: '批量下载选中的图片/视频/音频节点' });
    fireEvent.click(downloadBtn);

    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('点击添加到对话调用传入的 onAddImagesToComposer', () => {
    const onAdd = vi.fn();

    render(
      <CanvasMultiSelectToolbar
        projectId="project-1"
        selectedNodes={sampleNodes}
        zoom={1}
        onClearSelection={vi.fn()}
        onAddImagesToComposer={onAdd}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '添加到对话' }));
    expect(onAdd).toHaveBeenCalledWith(sampleNodes);
  });
});
