// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStyleExtractWorkflow } from '../useStyleExtractWorkflow';

describe('useStyleExtractWorkflow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('初始化时拥有正确的默认状态', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useStyleExtractWorkflow({
        isOpen: true,
        onClose,
      }),
    );

    expect(result.current.sourceType).toBe('link');
    expect(result.current.selectedImages).toEqual([]);
    expect(result.current.isExtracting).toBe(false);
    expect(result.current.extractedRecipe).toBeNull();
  });

  it('支持切换图片勾选 (handleToggleImage)', () => {
    const { result } = renderHook(() =>
      useStyleExtractWorkflow({
        isOpen: true,
        onClose: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleToggleImage('https://example.com/img1.jpg');
    });
    expect(result.current.selectedImages).toContain('https://example.com/img1.jpg');
    expect(result.current.selectedSet.has('https://example.com/img1.jpg')).toBe(true);

    // 再次点击取消勾选
    act(() => {
      result.current.handleToggleImage('https://example.com/img1.jpg');
    });
    expect(result.current.selectedImages).not.toContain('https://example.com/img1.jpg');
    expect(result.current.selectedSet.has('https://example.com/img1.jpg')).toBe(false);
  });

  it('支持智能均匀优选代表图 (handleAutoSelectKeyShots)', () => {
    const { result } = renderHook(() =>
      useStyleExtractWorkflow({
        isOpen: true,
        onClose: vi.fn(),
      }),
    );

    const mockImages = [
      'https://example.com/1.jpg',
      'https://example.com/2.jpg',
      'https://example.com/3.jpg',
      'https://example.com/4.jpg',
      'https://example.com/5.jpg',
      'https://example.com/6.jpg',
      'https://example.com/7.jpg',
      'https://example.com/8.jpg',
      'https://example.com/9.jpg',
      'https://example.com/10.jpg',
    ];

    act(() => {
      result.current.handleAutoSelectKeyShots(mockImages);
    });

    expect(result.current.selectedImages.length).toBeGreaterThanOrEqual(4);
    expect(result.current.selectedImages.length).toBeLessThanOrEqual(8);
  });
});
