import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';

export interface DropdownMenuState<T extends HTMLElement = HTMLDivElement> {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  ref: RefObject<T | null>;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * 泛型下拉菜单 Hook，封装开关状态、DOM 引用及点击外部与 ESC 键自动关闭机制
 */
export function useDropdownMenu<T extends HTMLElement = HTMLDivElement>(
  initialOpen = false,
  onClose?: () => void,
): DropdownMenuState<T> {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const ref = useRef<T>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    onClose?.();
  }, [onClose]);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, close]);

  return {
    isOpen,
    setIsOpen,
    ref,
    open,
    close,
    toggle,
  };
}
