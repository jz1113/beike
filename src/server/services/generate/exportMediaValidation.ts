import fs from 'node:fs/promises';
/** Keep complete CDN URLs: path case and query parameters may identify different assets. */
export function exportMediaKey(url: string): string {
  return url.trim().replace(/^\/\//, 'https://').split('#')[0];
}

export interface ExportMediaFormat { kind: 'image' | 'video'; extension: string }

/** Identify the actual container, rather than trusting CDN MIME or a requested filename. */
export function detectExportMediaFormat(buffer: Buffer): ExportMediaFormat | null {
  if (buffer.length < 12) return null;
  const ascii = (start: number, end: number) => buffer.toString('ascii', start, end);
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.length >= 33 && ascii(12, 16) === 'IHDR' && ascii(buffer.length - 8, buffer.length - 4) === 'IEND') return { kind: 'image', extension: 'png' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) return { kind: 'image', extension: 'jpg' };
  if (/^GIF8[79]a$/.test(ascii(0, 6)) && buffer.length >= 14 && buffer[buffer.length - 1] === 0x3b) return { kind: 'image', extension: 'gif' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' && buffer.length >= 20 && buffer.readUInt32LE(4) + 8 <= buffer.length) return { kind: 'image', extension: 'webp' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'AVI ' && buffer.length >= 24 && buffer.readUInt32LE(4) + 8 <= buffer.length) return { kind: 'video', extension: 'avi' };
  if (ascii(0, 3) === 'FLV' && buffer[3] === 1 && buffer.length >= 13 && buffer.readUInt32BE(5) >= 9 && buffer.readUInt32BE(5) + 4 <= buffer.length) return { kind: 'video', extension: 'flv' };
  if (ascii(0, 2) === 'BM' && buffer.length >= 54 && buffer.readUInt32LE(2) <= buffer.length) return { kind: 'image', extension: 'bmp' };
  if ((ascii(0, 4) === 'II*\0' || ascii(0, 4) === 'MM\0*') && buffer.length >= 16) return { kind: 'image', extension: 'tiff' };
  if (ascii(4, 8) === 'ftyp') {
    const boxSize = buffer.readUInt32BE(0);
    if (boxSize < 16 || boxSize > buffer.length) return null;
    const brands = [ascii(8, 12)];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(ascii(offset, offset + 4));
    if (brands.some(brand => ['avif', 'avis'].includes(brand))) return { kind: 'image', extension: 'avif' };
    if (brands.some(brand => ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand))) return { kind: 'image', extension: 'heic' };
    if (brands.some(brand => /^(?:isom|iso\d|mp4[12]|avc1|qt {2}|M4V |3g[pe])/.test(brand)) && boxSize + 8 <= buffer.length) return { kind: 'video', extension: brands.includes('qt  ') ? 'mov' : 'mp4' };
  }
  if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    const prefix = ascii(0, Math.min(buffer.length, 4096));
    if (prefix.includes('webm')) return { kind: 'video', extension: 'webm' };
    if (prefix.includes('matroska')) return { kind: 'video', extension: 'mkv' };
  }
  if (ascii(0, 4) === 'OggS' && buffer.length >= 64 && ascii(0, Math.min(buffer.length, 512)).includes('theora')) return { kind: 'video', extension: 'ogv' };
  return null;
}

export function isExportMediaBuffer(buffer: Buffer): boolean {
  return detectExportMediaFormat(buffer) !== null;
}

/** Validate staged containers using only the first 4096 and last 64 bytes. */
export async function detectStagedExportMediaFormat(filePath: string, size: number): Promise<ExportMediaFormat | null> {
  if (size < 12) return null;
  const file = await fs.open(filePath, 'r');
  try {
    const prefix = Buffer.alloc(Math.min(size, 4096));
    const tail = Buffer.alloc(Math.min(size, 64));
    await file.read(prefix, 0, prefix.length, 0);
    await file.read(tail, 0, tail.length, size - tail.length);
    const ascii = (start: number, end: number) => prefix.toString('ascii', start, end);
    if (prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && size >= 33 && ascii(12, 16) === 'IHDR' && tail.toString('ascii', tail.length - 8, tail.length - 4) === 'IEND') return { kind: 'image', extension: 'png' };
    if (prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255 && tail[tail.length - 2] === 255 && tail[tail.length - 1] === 217) return { kind: 'image', extension: 'jpg' };
    if (/^GIF8[79]a$/.test(ascii(0, 6)) && size >= 14 && tail[tail.length - 1] === 59) return { kind: 'image', extension: 'gif' };
    if (ascii(0, 4) === 'RIFF' && prefix.readUInt32LE(4) + 8 <= size) {
      if (ascii(8, 12) === 'WEBP' && size >= 20) return { kind: 'image', extension: 'webp' };
      if (ascii(8, 12) === 'AVI ' && size >= 24) return { kind: 'video', extension: 'avi' };
    }
    if (ascii(0, 2) === 'BM' && size >= 54 && prefix.readUInt32LE(2) <= size) return { kind: 'image', extension: 'bmp' };
    // ISO media and EBML signatures are at the front; other formats use their original bounded validator.
    return detectExportMediaFormat(prefix);
  } finally { await file.close(); }
}
