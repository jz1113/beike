import { describe, expect, it, vi } from 'vitest';
import { uploadStudioFile } from '@client/shared/api/uploadStudioFile';
import { uploadSalesImages } from './uploadSalesImages';
vi.mock('@client/shared/api/uploadStudioFile', () => ({ uploadStudioFile: vi.fn() }));

describe('bounded product uploads', () => {
  it('limits concurrency and retains successful uploads in input order after partial failure', async () => {
    let active = 0;
    let peak = 0;
    vi.mocked(uploadStudioFile).mockImplementation(async (file) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      if (file.name === '2.png') throw new Error('upload failed');
      return `/${file.name}`;
    });
    const result = await uploadSalesImages(Array.from({ length: 5 }, (_, i) => new File(['image'], `${i}.png`)));
    expect(peak).toBe(3);
    expect(result).toEqual({ urls: ['/0.png', '/1.png', '/3.png', '/4.png'], failed: 1 });
  });
});
