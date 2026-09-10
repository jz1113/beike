// @vitest-environment happy-dom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CanvasAssetImportModal } from '../components/CanvasAssetImportModal';
import type { GenerationTask } from '@/types/app-store';

describe('CanvasAssetImportModal (高性能资产选取弹窗)', () => {
  afterEach(() => {
    cleanup();
  });
  const mockTasks: GenerationTask[] = [
    {
      id: 'task-img-1',
      title: '产品实拍图 1',
      prompt: '4k 超清真实商品',
      model: 'upscale-v2-4k',
      size: '1024x1024',
      quality: 'hd',
      status: 'SUCCESS',
      progress: '100%',
      resultUrl: 'https://example.com/pic1.jpg',
      useReferenceImage: false,
    },
    {
      id: 'task-img-2',
      title: '自然风景图 2',
      prompt: '海边夕阳',
      model: 'midjourney-fast',
      size: '1024x1024',
      quality: 'standard',
      status: 'SUCCESS',
      progress: '100%',
      resultUrl: 'https://example.com/pic2.jpg',
      useReferenceImage: false,
      isFavorite: true,
    } as any,
    {
      id: 'task-img-3',
      title: '微距静物 3',
      prompt: '咖啡豆特写',
      model: 'sdxl',
      size: '1024x1024',
      quality: 'standard',
      status: 'SUCCESS',
      progress: '100%',
      resultUrl: 'https://example.com/pic3.jpg',
      useReferenceImage: false,
    },
  ];

  it('renders correctly when open and displays images with lazy loading and async decoding', () => {
    const onClose = vi.fn();
    const onConfirmImport = vi.fn();

    render(
      <CanvasAssetImportModal
        isOpen={true}
        modalTab="image"
        tasks={mockTasks}
        onClose={onClose}
        onConfirmImport={onConfirmImport}
      />
    );

    expect(screen.getByText('资产选取')).toBeDefined();
    expect(screen.getByText('所有图片')).toBeDefined();
    expect(screen.queryByText('超清')).toBeNull();
    expect(screen.queryByText('收藏')).toBeNull();
    expect(screen.getByText('已选 0 张图片')).toBeDefined();

    // 验证所有图片均添加了性能优化属性：loading="lazy" 与 decoding="async"
    const img1 = screen.getByAltText('产品实拍图 1') as HTMLImageElement;
    expect(img1).toBeDefined();
    expect(img1.getAttribute('loading')).toBe('lazy');
    expect(img1.getAttribute('decoding')).toBe('async');
  });

  it('supports multiple item selection and updates count accurately', () => {
    const onClose = vi.fn();
    const onConfirmImport = vi.fn();

    render(
      <CanvasAssetImportModal
        isOpen={true}
        modalTab="image"
        tasks={mockTasks}
        onClose={onClose}
        onConfirmImport={onConfirmImport}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    // 勾选第一张
    const card1 = screen.getByAltText('产品实拍图 1').closest('div')!;
    fireEvent.click(card1);
    expect(screen.getByText('已选 1 张图片')).toBeDefined();
    expect(confirmBtn.disabled).toBe(false);

    // 勾选第二张
    const card2 = screen.getByAltText('自然风景图 2').closest('div')!;
    fireEvent.click(card2);
    expect(screen.getByText('已选 2 张图片')).toBeDefined();

    // 再次点击第一张，取消勾选
    fireEvent.click(card1);
    expect(screen.getByText('已选 1 张图片')).toBeDefined();

    // 点击确认导入
    fireEvent.click(confirmBtn);
    expect(onConfirmImport).toHaveBeenCalledWith([mockTasks[1]]);
  });

  it('verifies "超清" and "收藏" tabs are removed and displays all tasks directly', () => {
    const onClose = vi.fn();
    const onConfirmImport = vi.fn();

    render(
      <CanvasAssetImportModal
        isOpen={true}
        modalTab="image"
        tasks={mockTasks}
        onClose={onClose}
        onConfirmImport={onConfirmImport}
      />
    );

    // 确认“超清”和“收藏”标签已被完全移除
    expect(screen.queryByText('超清')).toBeNull();
    expect(screen.queryByText('收藏')).toBeNull();

    // 默认直接展示所有图片
    expect(screen.getByAltText('产品实拍图 1')).toBeDefined();
    expect(screen.getByAltText('自然风景图 2')).toBeDefined();
    expect(screen.getByAltText('微距静物 3')).toBeDefined();
  });

  it('supports double click on an asset to immediately import and close', () => {
    const onClose = vi.fn();
    const onConfirmImport = vi.fn();

    render(
      <CanvasAssetImportModal
        isOpen={true}
        modalTab="image"
        tasks={mockTasks}
        onClose={onClose}
        onConfirmImport={onConfirmImport}
      />
    );

    const card3 = screen.getByAltText('微距静物 3').closest('div')!;
    fireEvent.doubleClick(card3);

    expect(onConfirmImport).toHaveBeenCalledWith([mockTasks[2]]);
  });

  it('handles empty state and displays upload local fallback button', () => {
    const onClose = vi.fn();
    const onConfirmImport = vi.fn();
    const onUploadLocalFile = vi.fn();

    render(
      <CanvasAssetImportModal
        isOpen={true}
        modalTab="image"
        tasks={[]}
        onClose={onClose}
        onConfirmImport={onConfirmImport}
        onUploadLocalFile={onUploadLocalFile}
      />
    );

    expect(screen.getByText('暂无符合条件的图片资产')).toBeDefined();
    const uploadBtn = screen.getByText('本地上传图片');
    fireEvent.click(uploadBtn);

    expect(onClose).toHaveBeenCalled();
    expect(onUploadLocalFile).toHaveBeenCalled();
  });

  it('supports empty selection via clear button and Enter key shortcut to confirm', () => {
    const onClose = vi.fn();
    const onConfirmImport = vi.fn();

    render(
      <CanvasAssetImportModal
        isOpen={true}
        modalTab="image"
        tasks={mockTasks}
        onClose={onClose}
        onConfirmImport={onConfirmImport}
      />
    );

    // 勾选第一张图
    const card1 = screen.getByAltText('产品实拍图 1').closest('div')!;
    fireEvent.click(card1);
    expect(screen.getByText('已选 1 张图片')).toBeDefined();

    // 存在清空按钮
    const clearBtn = screen.getByText('清空');
    fireEvent.click(clearBtn);
    expect(screen.getByText('已选 0 张图片')).toBeDefined();
    expect(screen.queryByText('清空')).toBeNull();

    // 再次勾选第二张图，并测试 Enter 键
    const card2 = screen.getByAltText('自然风景图 2').closest('div')!;
    fireEvent.click(card2);
    expect(screen.getByText('已选 1 张图片')).toBeDefined();

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onConfirmImport).toHaveBeenCalledWith([mockTasks[1]]);
  });
});

