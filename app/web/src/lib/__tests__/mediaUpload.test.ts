import { describe, expect, it, vi } from 'vitest';
import { isImageFile, isImageOrVideoFile, isVideoFile, processDroppedMediaFiles } from '../mediaUpload';

function mockFile(name: string, type = ''): File {
  return { name, type } as File;
}

describe('mediaUpload file detection', () => {
  it('recognizes image by MIME', () => {
    expect(isImageFile(mockFile('photo.jpg', 'image/jpeg'))).toBe(true);
  });

  it('recognizes image by extension when MIME is empty (macOS/Tauri Finder drag)', () => {
    expect(isImageFile(mockFile('008332032002df95.jpg', ''))).toBe(true);
    expect(isImageFile(mockFile('photo.PNG', ''))).toBe(true);
    expect(isImageFile(mockFile('pic.webp', ''))).toBe(true);
  });

  it('recognizes video by MIME or extension', () => {
    expect(isVideoFile(mockFile('clip.mp4', 'video/mp4'))).toBe(true);
    expect(isVideoFile(mockFile('clip.mov', ''))).toBe(true);
  });

  it('rejects non-media files', () => {
    expect(isImageOrVideoFile(mockFile('readme.txt', ''))).toBe(false);
    expect(isImageOrVideoFile(mockFile('data.json', 'application/json'))).toBe(false);
  });

  it('isImageOrVideoFile combines image and video', () => {
    expect(isImageOrVideoFile(mockFile('a.jpg', ''))).toBe(true);
    expect(isImageOrVideoFile(mockFile('b.webm', ''))).toBe(true);
  });

  it('processDroppedMediaFiles counts skipped non-media files', async () => {
    const onAllSkipped = vi.fn();
    const result = await processDroppedMediaFiles([mockFile('x.txt', '')], vi.fn(), { onAllSkipped });
    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(onAllSkipped).toHaveBeenCalled();
  });
});
