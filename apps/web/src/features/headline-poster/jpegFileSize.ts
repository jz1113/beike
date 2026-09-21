export const MIN_COVER_FILE_BYTES = 200 * 1024 + 1;
export const MAX_COVER_FILE_BYTES = 5 * 1024 * 1024 - 1;

/**
 * A clean colour-field cover can be far below a platform's minimum file size
 * even at maximum JPEG quality. Add legal JPEG COM segments in that rare
 * case, preserving every rendered pixel instead of adding visual noise.
 */
export async function enforceCoverJpegFileSize(blob: Blob): Promise<Blob> {
  if (blob.size >= MIN_COVER_FILE_BYTES && blob.size <= MAX_COVER_FILE_BYTES) return blob;
  if (blob.size > MAX_COVER_FILE_BYTES) {
    throw new Error('封面无法压缩到严格小于 5MB，请降低图片质量后重试');
  }

  const source = new Uint8Array(await blob.arrayBuffer());
  if (source.length < 2 || source[0] !== 0xff || source[1] !== 0xd8) {
    throw new Error('导出文件不是有效 JPEG，无法校验封面体积');
  }

  let remaining = MIN_COVER_FILE_BYTES - blob.size;
  const segments: ArrayBuffer[] = [];
  while (remaining > 0) {
    // JPEG COM length includes the two-byte length field, so payload must be
    // at most 65,533 bytes. Every segment adds payload + 4 bytes.
    const payloadLength = Math.min(65_533, Math.max(1, remaining - 4));
    const segment = new Uint8Array(new ArrayBuffer(payloadLength + 4));
    segment[0] = 0xff;
    segment[1] = 0xfe;
    const encodedLength = payloadLength + 2;
    segment[2] = encodedLength >> 8;
    segment[3] = encodedLength & 0xff;
    segments.push(segment.buffer);
    remaining -= segment.length;
  }

  const prefix = source.buffer.slice(source.byteOffset, source.byteOffset + 2);
  const suffix = source.buffer.slice(source.byteOffset + 2);
  return new Blob([prefix, ...segments, suffix], { type: 'image/jpeg' });
}
