// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeedExpandedGrid from '../FeedExpandedGrid';
import type { GenerationTask } from '@/store/useAppStore';

describe('FeedExpandedGrid', () => {
  beforeEach(() => {
    cleanup();
  });

  const mockTasks: GenerationTask[] = [
    {
      id: 't-success-1',
      title: '任务1',
      prompt: '测试提示词1',
      model: 'gpt-image-2',
      size: '2448x3264',
      quality: 'high',
      useReferenceImage: false,
      status: 'SUCCESS',
      progress: '100%',
      resultUrl: 'https://example.com/img1.png',
    },
    {
      id: 't-success-2',
      title: '任务2',
      prompt: '测试提示词2',
      model: 'gpt-image-2',
      size: '2448x3264',
      quality: 'high',
      useReferenceImage: false,
      status: 'SUCCESS',
      progress: '100%',
      resultUrl: 'https://example.com/img2.png',
    },
    {
      id: 't-fail-3',
      title: '任务3',
      prompt: '测试提示词3',
      model: 'gpt-image-2',
      size: '2448x3264',
      quality: 'high',
      useReferenceImage: false,
      status: 'FAILURE',
      progress: '0%',
      failReason: '网络超时',
    },
    {
      id: 't-in-progress-4',
      title: '任务4',
      prompt: '测试提示词4',
      model: 'gpt-image-2',
      size: '2448x3264',
      quality: 'high',
      useReferenceImage: false,
      status: 'IN_PROGRESS',
      progress: '15%',
    },
  ];

  it('renders failure card with reason, retry button, and clear button', () => {
    const onDeleteTask = vi.fn();
    const onDeleteFailedTasks = vi.fn();
    const onRetryTask = vi.fn();

    render(
      <FeedExpandedGrid
        batch={{ batchId: 'b-1', tasks: mockTasks }}
        primaryTask={mockTasks[0]}
        isBatchVideo={false}
        premiumGeneratingTaskId={null}
        openMenuTaskId={null}
        setOpenMenuTaskId={vi.fn()}
        onPreview={vi.fn()}
        onReuse={vi.fn()}
        onRegenerate={vi.fn()}
        onCopyPrompt={vi.fn()}
        onDownload={vi.fn()}
        onDeleteBatch={vi.fn()}
        onDeleteTask={onDeleteTask}
        onDeleteFailedTasks={onDeleteFailedTasks}
        onRetryTask={onRetryTask}
      />
    );

    // 检查失败卡片文本
    expect(screen.getByText('生成失败')).toBeInTheDocument();
    expect(screen.getByText('网络超时')).toBeInTheDocument();

    // 点击重试
    const retryBtn = screen.getByRole('button', { name: /重试/i });
    fireEvent.click(retryBtn);
    expect(onRetryTask).toHaveBeenCalledWith(mockTasks[2]);

    // 点击失败卡片上的清除按钮
    const clearBtn = screen.getByRole('button', { name: /清除$/i });
    fireEvent.click(clearBtn);
    expect(onDeleteTask).toHaveBeenCalledWith(mockTasks[2]);
  });

  it('renders bottom clear failed button when uncompleted tasks exist alongside success tasks', () => {
    const onDeleteFailedTasks = vi.fn();

    render(
      <FeedExpandedGrid
        batch={{ batchId: 'b-1', tasks: mockTasks }}
        primaryTask={mockTasks[0]}
        isBatchVideo={false}
        premiumGeneratingTaskId={null}
        openMenuTaskId={null}
        setOpenMenuTaskId={vi.fn()}
        onPreview={vi.fn()}
        onReuse={vi.fn()}
        onRegenerate={vi.fn()}
        onCopyPrompt={vi.fn()}
        onDownload={vi.fn()}
        onDeleteBatch={vi.fn()}
        onDeleteTask={vi.fn()}
        onDeleteFailedTasks={onDeleteFailedTasks}
      />
    );

    // 2 个未完成任务（1个失败，1个进行中卡在15%）
    const bottomClearBtn = screen.getByRole('button', { name: /清除失败 \(2\)/i });
    expect(bottomClearBtn).toBeInTheDocument();

    fireEvent.click(bottomClearBtn);
    expect(onDeleteFailedTasks).toHaveBeenCalledWith([mockTasks[2], mockTasks[3]]);
  });
});
