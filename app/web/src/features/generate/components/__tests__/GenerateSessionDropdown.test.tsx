// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GenerateSessionDropdown } from '../GenerateSessionDropdown';
import type { ChatSession } from '@/store/useAppStore';

const mockSessions: ChatSession[] = [
  {
    id: 'sess-1',
    title: '动漫随机原画群像',
    createdAt: Date.now(),
    tasks: [],
  },
  {
    id: 'sess-2',
    title: '一只可爱的猫咪',
    createdAt: Date.now() - 10000,
    tasks: [],
  },
];

describe('GenerateSessionDropdown', () => {
  beforeEach(() => {
    cleanup();
  });

  it('默认正确渲染当前激活对话标题且下拉处于收起状态', () => {
    render(
      <GenerateSessionDropdown
        sessions={mockSessions}
        currentSessionId="sess-1"
        activeSessionTitle="动漫随机原画群像"
        onCreateSession={vi.fn()}
        onSwitchSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
      />,
    );

    expect(screen.getByText('动漫随机原画群像')).toBeInTheDocument();
    expect(screen.queryByText('新对话')).not.toBeInTheDocument();
  });

  it('点击胶囊触发器后展开浮层并展示新对话与会话列表', () => {
    render(
      <GenerateSessionDropdown
        sessions={mockSessions}
        currentSessionId="sess-1"
        activeSessionTitle="动漫随机原画群像"
        onCreateSession={vi.fn()}
        onSwitchSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
      />,
    );

    const trigger = screen.getByTitle('切换或管理创作对话');
    fireEvent.click(trigger);

    expect(screen.getByText('新对话')).toBeInTheDocument();
    expect(screen.getByText('最近')).toBeInTheDocument();
    expect(screen.getByText('一只可爱的猫咪')).toBeInTheDocument();
  });

  it('点击新对话按钮调用 onCreateSession 并自动收起浮层', () => {
    const onCreate = vi.fn();
    render(
      <GenerateSessionDropdown
        sessions={mockSessions}
        currentSessionId="sess-1"
        activeSessionTitle="动漫随机原画群像"
        onCreateSession={onCreate}
        onSwitchSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('切换或管理创作对话'));
    fireEvent.click(screen.getByText('新对话'));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('最近')).not.toBeInTheDocument();
  });

  it('点击列表中的其他会话调用 onSwitchSession 并自动收起浮层', () => {
    const onSwitch = vi.fn();
    render(
      <GenerateSessionDropdown
        sessions={mockSessions}
        currentSessionId="sess-1"
        activeSessionTitle="动漫随机原画群像"
        onCreateSession={vi.fn()}
        onSwitchSession={onSwitch}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('切换或管理创作对话'));
    fireEvent.click(screen.getByText('一只可爱的猫咪'));

    expect(onSwitch).toHaveBeenCalledWith('sess-2');
    expect(screen.queryByText('最近')).not.toBeInTheDocument();
  });

  it('按下 Escape 键能够平滑关闭浮层', () => {
    render(
      <GenerateSessionDropdown
        sessions={mockSessions}
        currentSessionId="sess-1"
        activeSessionTitle="动漫随机原画群像"
        onCreateSession={vi.fn()}
        onSwitchSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('切换或管理创作对话'));
    expect(screen.getByText('新对话')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('新对话')).not.toBeInTheDocument();
  });
});
