import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  enforceCoverJpegFileSize,
  MAX_COVER_FILE_BYTES,
  MIN_COVER_FILE_BYTES,
} from './jpegFileSize.ts';

function jpeg(bytes = []) {
  return new Blob([new Uint8Array([0xff, 0xd8, ...bytes, 0xff, 0xd9])], { type: 'image/jpeg' });
}

test('raises a valid small JPEG above the strict 200KB lower bound without changing its JPEG framing', async () => {
  const output = await enforceCoverJpegFileSize(jpeg([1, 2, 3]));
  const bytes = new Uint8Array(await output.arrayBuffer());
  assert.ok(output.size >= MIN_COVER_FILE_BYTES);
  assert.ok(output.size <= MAX_COVER_FILE_BYTES);
  assert.deepEqual([...bytes.slice(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...bytes.slice(-2)], [0xff, 0xd9]);
  assert.equal(bytes[2], 0xff);
  assert.equal(bytes[3], 0xfe);
});

test('preserves an already in-range JPEG byte-for-byte', async () => {
  const input = new Blob([new Uint8Array(MIN_COVER_FILE_BYTES)], { type: 'image/jpeg' });
  assert.equal(await enforceCoverJpegFileSize(input), input);
});

test('rejects files that already exceed the strict 5MB ceiling', async () => {
  await assert.rejects(
    enforceCoverJpegFileSize(new Blob([new Uint8Array(MAX_COVER_FILE_BYTES + 1)], { type: 'image/jpeg' })),
    /严格小于 5MB/,
  );
});
