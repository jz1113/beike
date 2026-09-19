// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AssetGenerationHistory from '../AssetGenerationHistory';
import type { AssetTaskBatch } from '../assetBatch';

// Mock proxyMediaUrl
vi.mock('@/lib/apiClient', () => ({
  proxyMediaUrl: (url: string) => url,
}));

describe('AssetGenerationHistory 文件夹有效计数测试', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('当批次中有 2 张成功图片和 1 张失败任务时，Folder 角标显示真实的 2P，副标题准确标注 2 张图片 (1张失败)', () => {
    const mockBatch: AssetTaskBatch = {
      batchId: 'batch-test-1',
      title: '宝可梦小智和喷火龙合照',
      prompt: '宝可梦小智和喷火龙合照',
      model: 'gpt-image-2',
      createdAt: Date.now(),
      tasks: [
        {
          id: 'task-1',
          status: 'SUCCESS',
          resultUrl: 'https://example.com/img1.jpg',
          mediaType: 'image',
          createdAt: Date.now(),
        },
        {
          id: 'task-2',
          status: 'SUCCESS',
          resultUrl: 'https://example.com/img2.jpg',
          mediaType: 'image',
          createdAt: Date.now(),
        },
        {
          id: 'task-3',
          status: 'FAILURE',
          resultUrl: '',
          failReason: 'Invalid image file or mode for image 1',
          mediaType: 'image',
          createdAt: Date.now(),
        },
      ],
    };

    render(
      <AssetGenerationHistory
        mediaCategory="image"
        mergedTasks={mockBatch.tasks}
        visibleToday={[mockBatch]}
        visibleYesterday={[]}
        visibleEarlier={[]}
        hasMore={false}
        renderedBatches={1}
        totalBatches={1}
        loadMoreSentinelRef={{ current: null }}
        isBatchMode={false}
        selectedTaskIds={[]}
        setSelectedTaskIds={vi.fn()}
        setIsBatchMode={vi.fn()}
        copiedId={null}
        setCopiedId={vi.fn()}
        setCurrentView={vi.fn()}
        setPreviewTask={vi.fn()}
        setQuickPrompt={vi.fn()}
        showToast={vi.fn()}
        onDeleteBatch={vi.fn()}
        onDeleteTask={vi.fn()}
        onRegenerate={vi.fn()}
      />
    );

    // 1. 角标必须显示真实有效的 2P（而不是包含失败的 3P 或 4P）
    expect(screen.getByText('2P')).toBeInTheDocument();
    expect(screen.queryByText('3P')).not.toBeInTheDocument();
    expect(screen.queryByText('4P')).not.toBeInTheDocument();

    // 2. 副标题清晰标注有效张数与失败张数
    expect(screen.getByText(/2 张图片 \(1张失败\)/)).toBeInTheDocument();
  });
});
