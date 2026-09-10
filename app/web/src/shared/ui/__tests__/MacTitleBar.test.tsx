import { describe, it, expect, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import MacTitleBar from '../MacTitleBar';
import { getDesktopPlatform, isMacOs, isWindows } from '@/lib/desktopRuntime';

describe('MacTitleBar and OS Detection', () => {
  const originalNavigator = window.navigator;

  afterEach(() => {
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('correctly identifies Windows and suppresses MacTitleBar', () => {
    Object.defineProperty(window, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        platform: 'Win32',
      },
      configurable: true,
      writable: true,
    });

    expect(getDesktopPlatform()).toBe('windows');
    expect(isWindows()).toBe(true);
    expect(isMacOs()).toBe(false);

    const { container } = render(<MacTitleBar />);
    expect(container.firstChild).toBeNull();
  });

  it('correctly identifies macOS and renders MacTitleBar', () => {
    Object.defineProperty(window, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        platform: 'MacIntel',
      },
      configurable: true,
      writable: true,
    });

    expect(getDesktopPlatform()).toBe('macos');
    expect(isMacOs()).toBe(true);
    expect(isWindows()).toBe(false);

    const { container, getByText } = render(<MacTitleBar />);
    expect(container.firstChild).not.toBeNull();
    expect(getByText('贝壳云图')).toBeDefined();
  });
});
