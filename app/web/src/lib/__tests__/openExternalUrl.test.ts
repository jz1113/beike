import { afterEach, expect, it, vi } from 'vitest';
import { openExternalUrl } from '../downloadMedia';

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it('opens a new tab in the browser', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  await openExternalUrl('https://example.com/image.jpg');
  expect(open).toHaveBeenCalledWith('https://example.com/image.jpg', '_blank', 'noopener,noreferrer');
});
