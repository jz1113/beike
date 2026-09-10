// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeedCardActionBar from '../FeedCardActionBar';

describe('FeedCardActionBar', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renders all action buttons with correct labels and styles from reference image', () => {
    const onReuse = vi.fn();
    const onRegenerate = vi.fn();
    const onToggleMenu = vi.fn();
    const onDelete = vi.fn();

    render(
      <FeedCardActionBar
        onReuse={onReuse}
        onRegenerate={onRegenerate}
        isMenuOpen={false}
        onToggleMenu={onToggleMenu}
        onDelete={onDelete}
      />
    );

    const reEditBtn = screen.getByRole('button', { name: /重新编辑/i });
    expect(reEditBtn).toBeInTheDocument();
    expect(reEditBtn.className).toContain('h-10');
    expect(reEditBtn.className).toContain('rounded-[13px]');
    expect(reEditBtn.className).toContain('bg-[#EBEDF0]');

    const regenerateBtn = screen.getByRole('button', { name: /再次生成/i });
    expect(regenerateBtn).toBeInTheDocument();
    expect(regenerateBtn.className).toContain('h-10');
    expect(regenerateBtn.className).toContain('rounded-[13px]');

    const moreBtn = screen.getByRole('button', { name: /更多操作/i });
    expect(moreBtn).toBeInTheDocument();
    expect(moreBtn.className).toContain('w-10');
    expect(moreBtn.className).toContain('h-10');
    expect(moreBtn.className).toContain('rounded-[13px]');

    fireEvent.click(reEditBtn);
    expect(onReuse).toHaveBeenCalledTimes(1);

    fireEvent.click(regenerateBtn);
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    fireEvent.click(moreBtn);
    expect(onToggleMenu).toHaveBeenCalledTimes(1);
  });

  it('renders delete menu when isMenuOpen is true and triggers onDelete', () => {
    const onReuse = vi.fn();
    const onRegenerate = vi.fn();
    const onToggleMenu = vi.fn();
    const onDelete = vi.fn();

    const { rerender } = render(
      <FeedCardActionBar
        onReuse={onReuse}
        onRegenerate={onRegenerate}
        isMenuOpen={false}
        onToggleMenu={onToggleMenu}
        onDelete={onDelete}
      />
    );

    expect(screen.queryByText('删除该批次结果')).toBeNull();

    rerender(
      <FeedCardActionBar
        onReuse={onReuse}
        onRegenerate={onRegenerate}
        isMenuOpen={true}
        onToggleMenu={onToggleMenu}
        onDelete={onDelete}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /删除该批次结果/i });
    expect(deleteBtn).toBeInTheDocument();

    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('renders clear failed button and menu item when failedCount > 0 and onClearFailed is provided', () => {
    const onReuse = vi.fn();
    const onRegenerate = vi.fn();
    const onToggleMenu = vi.fn();
    const onDelete = vi.fn();
    const onClearFailed = vi.fn();

    const { rerender } = render(
      <FeedCardActionBar
        onReuse={onReuse}
        onRegenerate={onRegenerate}
        isMenuOpen={false}
        onToggleMenu={onToggleMenu}
        onDelete={onDelete}
        failedCount={2}
        onClearFailed={onClearFailed}
      />
    );

    const clearBtn = screen.getByRole('button', { name: /清除失败 \(2\)/i });
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(onClearFailed).toHaveBeenCalledTimes(1);

    rerender(
      <FeedCardActionBar
        onReuse={onReuse}
        onRegenerate={onRegenerate}
        isMenuOpen={true}
        onToggleMenu={onToggleMenu}
        onDelete={onDelete}
        failedCount={2}
        onClearFailed={onClearFailed}
      />
    );

    const clearMenuItem = screen.getByRole('button', { name: /清除未成功卡片 \(2\)/i });
    expect(clearMenuItem).toBeInTheDocument();
    fireEvent.click(clearMenuItem);
    expect(onClearFailed).toHaveBeenCalledTimes(2);
  });
});
