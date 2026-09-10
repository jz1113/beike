// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkshopSideCapsuleBar } from '../components/WorkshopSideCapsuleBar';
import { useAppStore } from '@/store/useAppStore';

describe('WorkshopSideCapsuleBar', () => {
  const mockOnSelectTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      isAssistantOpen: false,
      isWorkshopConfigOpen: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders all 4 workshop tabs and tool buttons', () => {
    render(
      <WorkshopSideCapsuleBar
        activeTab="studio"
        onSelectTab={mockOnSelectTab}
      />
    );

    // 检查是否有 4 个标签项按钮与 1 个工坊生产预设快捷工具按钮（已移除冗余的 AI 营销顾问）
    expect(screen.getByLabelText('创作工作台')).toBeTruthy();
    expect(screen.getByLabelText('提示词资产库')).toBeTruthy();
    expect(screen.getByLabelText('类目拍摄架构')).toBeTruthy();
    expect(screen.getByLabelText('商品主体库')).toBeTruthy();
    expect(screen.queryByLabelText('AI 营销顾问')).toBeNull();
    expect(screen.getByLabelText('工坊生产预设')).toBeTruthy();
  });

  it('calls onSelectTab when a workshop tab button is clicked', () => {
    render(
      <WorkshopSideCapsuleBar
        activeTab="studio"
        onSelectTab={mockOnSelectTab}
      />
    );

    fireEvent.click(screen.getByLabelText('提示词资产库'));
    expect(mockOnSelectTab).toHaveBeenCalledWith('prompt_assets');

    fireEvent.click(screen.getByLabelText('类目拍摄架构'));
    expect(mockOnSelectTab).toHaveBeenCalledWith('recipes');

    fireEvent.click(screen.getByLabelText('商品主体库'));
    expect(mockOnSelectTab).toHaveBeenCalledWith('products');
  });

  it('opens workshop config modal when settings button is clicked', () => {
    render(
      <WorkshopSideCapsuleBar
        activeTab="studio"
        onSelectTab={mockOnSelectTab}
      />
    );

    expect(useAppStore.getState().isWorkshopConfigOpen).toBe(false);
    fireEvent.click(screen.getByLabelText('工坊生产预设'));
    expect(useAppStore.getState().isWorkshopConfigOpen).toBe(true);
  });
});
