import { describe, expect, it } from 'vitest';
import {
  collectDroppedFiles,
  imagesFromDroppedEntries,
  isProductImageFile,
  productImageFiles,
  readDirectoryChildren,
  type DroppedEntry,
} from './productImageDrop';

function file(name: string, type = ''): File {
  return new File(['x'], name, { type });
}

function fileEntry(name: string, type = '', fail = false): DroppedEntry {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: fail ? async () => { throw new Error('unreadable'); } : async () => file(name, type),
  };
}

describe('product image drops', () => {
  it('accepts photos by type or extension and skips hidden files', () => {
    expect(isProductImageFile(file('look.jpg'))).toBe(true);
    expect(isProductImageFile(file('look.HEIC'))).toBe(true);
    expect(isProductImageFile(file('shot', 'image/png'))).toBe(true);
    expect(isProductImageFile(file('notes.txt', 'text/plain'))).toBe(false);
    expect(isProductImageFile(file('.DS_Store'))).toBe(false);
    expect(isProductImageFile(file('._look.jpg'))).toBe(false);
  });

  it('reads every directory batch and walks nested folders', async () => {
    let calls = 0;
    const children = await readDirectoryChildren(async () => {
      calls += 1;
      if (calls === 1) return [fileEntry('1.jpg'), fileEntry('2.jpg')];
      if (calls === 2) return [fileEntry('10.jpg')];
      return [];
    });
    expect(children.map((entry) => entry.name)).toEqual(['1.jpg', '2.jpg', '10.jpg']);

    const folder: DroppedEntry = {
      name: 'goods',
      isFile: false,
      isDirectory: true,
      readChildren: async () => [
        fileEntry('2.jpg'),
        fileEntry('notes.txt', 'text/plain'),
        fileEntry('broken.png', '', true),
        {
          name: 'detail',
          isFile: false,
          isDirectory: true,
          readChildren: async () => [fileEntry('10.heic'), fileEntry('.DS_Store')],
        },
      ],
    };
    const images = await imagesFromDroppedEntries([folder], [file('fallback.jpg', 'image/jpeg')]);
    expect(images.map((image) => image.name)).toEqual(['2.jpg', '10.heic']);
  });

  it('uses the flat file list when directory entries yield no images', async () => {
    const images = await imagesFromDroppedEntries([], [file('main.webp', 'image/webp'), file('readme.txt', 'text/plain')]);
    expect(images.map((image) => image.name)).toEqual(['main.webp']);
    const walked = await collectDroppedFiles([fileEntry('a.png', 'image/png')]);
    expect(productImageFiles(walked).map((image) => image.name)).toEqual(['a.png']);
  });
});
