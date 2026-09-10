// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GenerateWorkspaceToolbar } from '../GenerateWorkspaceToolbar';
import type { ChatSession } from '@/store/useAppStore';

const mockSessions: ChatSession[] = [
  {
    id: 'sess-1',
    title: '动漫随机原画群像',
    createdAt: Date.now(),
    tasks: [],
  },
];

describe('GenerateWorkspaceToolbar (即梦原版高对比度设计)', () => {
  beforeEach(() => {
    cleanup();
  });

  const defaultProps = {
    activeSessionTitle: '动漫随机原画群像',
    sessions: mockSessions,
    currentSessionId: 'sess-1',
    onCreateSession: vi.fn(),
    onSwitchSession: vi.fn(),
    onDeleteSession: vi.fn(),
    onRenameSession: vi.fn(),
  };

  it('正确渲染顶部工具栏：左侧会话名称，已移除无用的右上角搜索与筛选按钮组', () => {
    render(<GenerateWorkspaceToolbar {...defaultProps} />);

    // 左侧极简高对比度会话胶囊
    expect(screen.getByText('动漫随机原画群像')).toBeInTheDocument();

    // 用户要求移除：搜索、时间筛选、生成模式筛选
    expect(screen.queryByTitle('搜索当前对话内容')).not.toBeInTheDocument();
    expect(screen.queryByText('时间')).not.toBeInTheDocument();
    expect(screen.queryByText('生成模式')).not.toBeInTheDocument();
    expect(screen.queryByText('操作类型')).not.toBeInTheDocument();
    expect(screen.queryByText('资产库')).not.toBeInTheDocument();
  });
});

