import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BatchStage4ProductItem } from '../components/BatchStage4ProductItem';
import BatchStage4Queue from '../BatchStage4Queue';
import type { BatchProductItem } from '../batchTypes';

vi.mock('@/shared/ui/LazyProxyImage', () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }));
afterEach(cleanup);

const item = {
  id: 'product-1', title: '测试手机', selectedProductImages: [],
  tasks: [{ id: 'task-1', title: '分镜1', shot_no: 1, status: 'SUCCESS', resultUrl: 'https://example.com/1.png' }],
  copywritingError: '文案接口超时',
} as unknown as BatchProductItem;

it('shows the copy failure and offers retry without hiding successful images', () => {
  const retry = vi.fn();
  render(<BatchStage4ProductItem item={item} generateCopywritingForProduct={retry}
    isExportingZip={false} setPreviewImageUrl={vi.fn()} />);
  expect(screen.getByText('图片 (1/1 已完成)')).toBeTruthy();
  expect(within(screen.getByRole('alert')).getByText('文案接口超时')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '重试文案' }));
  expect(retry).toHaveBeenCalledWith(item);
});

it('distinguishes image completion from missing copy in product navigation', () => {
  const props = {
    successfulItems: [item, { ...item, id: 'product-2', title: '另一款手机', copywritingError: undefined }],
    availableImageModels: [], selectedImageGenModel: '', setSelectedImageGenModel: vi.fn(),
    selectedQuality: 'high', setSelectedQuality: vi.fn(), selectedAspect: '3:4', setSelectedAspect: vi.fn(),
    isGeneratingBatch: false, totalTaskCount: 2, completedTaskCount: 2, successTaskCount: 2, failTaskCount: 0,
    hasHumanPersona: true, generateCopywritingForProduct: vi.fn(), isExportingZip: false,
    handleExportZip: vi.fn(), setPreviewImageUrl: vi.fn(),
  } satisfies React.ComponentProps<typeof BatchStage4Queue>;
  render(<BatchStage4Queue {...props} />);
  const navigation = within(screen.getByRole('navigation', { name: '切换交付商品' }));
  expect(navigation.getAllByText('图片已完成')).toHaveLength(2);
  expect(navigation.getByText('文案失败，待重试')).toBeTruthy();
  expect(navigation.getByText('文案待生成')).toBeTruthy();
  expect(navigation.queryByText('已完成')).toBeNull();
});
