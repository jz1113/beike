// @vitest-environment happy-dom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import BatchStage3Prompts from '../BatchStage3Prompts';
import type { BatchProductItem } from '../batchTypes';
import { proxyMediaUrl } from '@/lib/apiClient';

vi.mock('@/lib/apiClient', () => ({ proxyMediaUrl: vi.fn((url: string) => url) }));

vi.mock('../../../../store/useAppStore', () => ({
  useAppStore: (selector: any) => selector({ setIsWorkshopConfigOpen: vi.fn() }),
}));
afterEach(cleanup);

it('does not rerender unchanged visible cards as 100 off-page items finish', () => {
  const items = Array.from({ length: 104 }, (_, index) => ({
    id: String(index), title: `商品${index}`, selectedProductImages: ['https://example.com/cover.png'],
    analyzedSuccess: index < 4, prompts: [{ prompt: '提示词' }],
  })) as unknown as BatchProductItem[];
  const props = { successfulItems: items, setItems: vi.fn(), isAnalyzingAll: true,
    analyzeProgress: { current: 4, total: 104 }, startBatchVisionAnalyze: vi.fn(),
    analyzeSingleProduct: vi.fn(), handleRemoveItem: vi.fn(), startBatchGeneration: vi.fn(), onPrevStage: vi.fn(),
  };
  const { rerender } = render(<BatchStage3Prompts {...props} />);
  vi.mocked(proxyMediaUrl).mockClear();
  let updated = items;
  for (let i = 4; i < 104; i++) {
    updated = updated.map((item, index) => index === i ? { ...item, analyzedSuccess: true } : item);
    rerender(<BatchStage3Prompts {...props} successfulItems={updated}
      handleRemoveItem={vi.fn()} analyzeSingleProduct={vi.fn()}
      analyzeProgress={{ current: i + 1, total: 104 }} />);
  }
  expect(proxyMediaUrl).not.toHaveBeenCalled();
  // Visible changes still render normally; memoization must not hide results.
  updated = updated.map((item, index) => index === 0 ? { ...item, title: '更新后的商品' } : item);
  rerender(<BatchStage3Prompts {...props} successfulItems={updated} />);
  expect(screen.getByText('更新后的商品')).toBeTruthy();
  expect(proxyMediaUrl).toHaveBeenCalledTimes(1);
});

it('edits the actual grid prompt without mounting individual shot editors', () => {
  const item = { id: 'grid', title: '四宫格商品', selectedProductImages: [],
    analyzedSuccess: true, gridPrompt: '实际发送给模型的整组提示词',
    prompts: Array.from({ length: 4 }, (_, i) => ({ shot_no: i + 1, prompt: '分镜内容' })),
  } as unknown as BatchProductItem;
  const setItems = vi.fn();
  render(<BatchStage3Prompts generationStrategy="grid_first" successfulItems={[item]}
    setItems={setItems} isAnalyzingAll={false} analyzeProgress={{ current: 1, total: 1 }}
    startBatchVisionAnalyze={vi.fn()} analyzeSingleProduct={vi.fn()} handleRemoveItem={vi.fn()}
    startBatchGeneration={vi.fn()} onPrevStage={vi.fn()} />);
  expect(screen.queryByText('镜头 1')).toBeNull();
  fireEvent.click(screen.getByText('编辑提示词'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '修改后的整组提示词' } });
  const updated = setItems.mock.calls[0][0]([item]);
  expect(updated[0].gridPrompt).toBe('修改后的整组提示词');
  expect(updated[0].prompts).toBe(item.prompts);
});

it('bounds mounted shots for 100 completed products and keeps all products accessible', () => {
  const items = Array.from({ length: 100 }, (_, index) => ({
    id: String(index), title: `商品-${index}`, selectedProductImages: [],
    analyzedSuccess: true,
    prompts: Array.from({ length: 8 }, (_, shot) => ({
      shot_no: shot + 1, prompt: '长提示词测试'.repeat(1000),
      applied_scene: '共用庭院', applied_outfit: '共用白衣', applied_persona: '共用人物',
      applied_action: `独立动作${shot + 1}`,
    })),
  })) as unknown as BatchProductItem[];
  const props = {
    successfulItems: items, setItems: vi.fn(), isAnalyzingAll: false,
    analyzeProgress: { current: 100, total: 100 },
    startBatchVisionAnalyze: vi.fn(), analyzeSingleProduct: vi.fn(),
    handleRemoveItem: vi.fn(), startBatchGeneration: vi.fn(), onPrevStage: vi.fn(),
  };
  const { rerender } = render(<BatchStage3Prompts {...props} />);
  expect(screen.getAllByText('镜头 1')).toHaveLength(4);
  expect(screen.getAllByText(/共用庭院/)).toHaveLength(4);
  expect(screen.getAllByText(/共用白衣/)).toHaveLength(4);
  expect(screen.getAllByText(/共用人物/)).toHaveLength(4);
  expect(screen.getAllByText(/独立动作8/)).toHaveLength(4);
  expect(screen.queryByText('商品-4')).toBeNull();
  for (let page = 1; page < 25; page++) fireEvent.click(screen.getByText('下一页'));
  expect(screen.getByText('商品-99')).toBeTruthy();
  expect(screen.getAllByText('镜头 1')).toHaveLength(4);
  // Removing the final page clamps to a valid page rather than showing an empty list.
  rerender(<BatchStage3Prompts {...props} successfulItems={items.slice(0, 4)} />);
  expect(screen.getByText('商品-0')).toBeTruthy();
  expect(screen.queryByRole('navigation')).toBeNull();
});
