// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDropdownMenu } from '../useDropdownMenu';

describe('useDropdownMenu', () => {
  it('初始化时默认关闭', () => {
    const { result } = renderHook(() => useDropdownMenu());
    expect(result.current.isOpen).toBe(false);
  });

  it('支持 open, close 与 toggle', () => {
    const { result } = renderHook(() => useDropdownMenu());

    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('点击外部区域触发关闭并调用 onClose 回调', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useDropdownMenu(false, onClose));

    const container = document.createElement('div');
    const menuEl = document.createElement('div');
    const outsideEl = document.createElement('button');
    container.appendChild(menuEl);
    container.appendChild(outsideEl);
    document.body.appendChild(container);

    (result.current.ref as { current: HTMLElement }).current = menuEl;

    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      outsideEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(result.current.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    document.body.removeChild(container);
  });

  it('按 Escape 键触发关闭', () => {
    const { result } = renderHook(() => useDropdownMenu(true));
    expect(result.current.isOpen).toBe(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(result.current.isOpen).toBe(false);
  });
});
