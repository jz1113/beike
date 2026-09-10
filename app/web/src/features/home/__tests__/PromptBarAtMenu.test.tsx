// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { PromptBarAtMenu } from '../components/prompt-bar/controls/PromptBarAtMenu';

describe('PromptBarAtMenu — 1:1 还原图 1 设计与空态测试', () => {
  beforeEach(() => {
    cleanup();
  });

  it('当没有创建过主体时，应完美展示空态标题、说明文案、插画及创建主体按钮', () => {
    const handleCreateSubjectClick = vi.fn();
    const handleSelectSubject = vi.fn();

    render(
      <PromptBarAtMenu
        isUp={true}
        atMenuQuery=""
        allSubjects={[]}
        activeSubjects={[]}
        onCreateSubjectClick={handleCreateSubjectClick}
        onSelectSubject={handleSelectSubject}
      />
    );

    // 1. 顶部标题
    expect(screen.getByText('可能@的内容')).toBeTruthy();

    // 2. 空态提示文案（参考图 1）
    expect(screen.getByText('你还没有创建过主体')).toBeTruthy();

    // 3. 创建主体按钮
    const createBtn = screen.getByRole('button', { name: /创建主体/i });
    expect(createBtn).toBeTruthy();

    // 4. 点击创建主体触发回调
    fireEvent.click(createBtn);
    expect(handleCreateSubjectClick).toHaveBeenCalledTimes(1);
  });

  it('当存在主体列表时，应渲染已有主体项，并支持选择主体', () => {
    const handleCreateSubjectClick = vi.fn();
    const handleSelectSubject = vi.fn();

    const mockSubjects = [
      { id: 'sub-1', name: '模特A', url: 'https://example.com/a.jpg' },
      { id: 'sub-2', name: '模特B', url: 'https://example.com/b.jpg' },
    ];

    render(
      <PromptBarAtMenu
        isUp={true}
        atMenuQuery=""
        allSubjects={mockSubjects}
        activeSubjects={[]}
        onCreateSubjectClick={handleCreateSubjectClick}
        onSelectSubject={handleSelectSubject}
      />
    );

    // 显示主体名称
    expect(screen.getByText('模特A')).toBeTruthy();
    expect(screen.getByText('模特B')).toBeTruthy();

    // 点击主体触发选择回调
    fireEvent.click(screen.getByText('模特A'));
    expect(handleSelectSubject).toHaveBeenCalledWith(mockSubjects[0]);
  });

  it('支持搜索过滤主体', () => {
    const mockSubjects = [
      { id: 'sub-1', name: '法式白衬衫', url: 'https://example.com/a.jpg' },
      { id: 'sub-2', name: '牛仔短裙', url: 'https://example.com/b.jpg' },
    ];

    render(
      <PromptBarAtMenu
        isUp={true}
        atMenuQuery="衬衫"
        allSubjects={mockSubjects}
        activeSubjects={[]}
        onCreateSubjectClick={vi.fn()}
        onSelectSubject={vi.fn()}
      />
    );

    expect(screen.getByText('法式白衬衫')).toBeTruthy();
    expect(screen.queryByText('牛仔短裙')).toBeNull();
    expect(screen.getByText(/匹配: 衬衫/)).toBeTruthy();
  });
});
