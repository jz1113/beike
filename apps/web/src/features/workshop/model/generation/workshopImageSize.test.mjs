import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { normalizeOpenAiImageRequest } from '../../../../../../../packages/domain/src/modelAdapters/image/normalizeOpenAiImageModel.ts';
import { resolveGptImageSizeForModel } from '../../../../../../../packages/domain/src/modelAdapters/image/gptImageSafeSizes.ts';

globalThis.createImageBitmap ??= async () => { throw new Error("not mocked"); };
const bundle = await build({ entryPoints: [fileURLToPath(new URL('./workshopImageSize.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'original-image', setup(build) {
    build.onLoad({ filter: /downloadMedia\.ts$/ }, () => ({ contents: 'export async function fetchMediaBlob(url) { if (url === "unavailable") throw new Error("offline"); return new Blob([url]); }' }));
  } }],
});
const { resolveWorkshopImageSize, assertWorkshopImageSize, verifyWorkshopImageSize } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('all workshop sizes use the same normalized contract as the server', () => {
  for (const model of ['gpt-image-2', 'gpt-image-2-4k', 'gpt-image-2-2k', 'openai/gpt-image-2']) {
    for (const aspect of ['3:4', '1:1', '9:16', '16:9']) {
      for (const quality of ['low', 'medium', 'high']) {
        const raw = resolveGptImageSizeForModel(aspect, model, quality);
        const size = resolveWorkshopImageSize(aspect, model, quality);
        assert.equal(size, normalizeOpenAiImageRequest(model, raw, quality, aspect).size);
        assert.equal(size, normalizeOpenAiImageRequest(model, size, quality, aspect).size, 'normalizing twice must be stable');
        assertWorkshopImageSize(...size.split('x').map(Number), size);
      }
    }
  }
});

test('even a one-pixel mismatch is held for review without stretching or rebilling', () => {
  assert.throws(() => assertWorkshopImageSize(960, 1279, '960x1280'), error => {
    assert.equal(error.recoveryRequired, true);
    assert.equal(error.retryable, false);
    assert.match(error.message, /960x1280.*960x1279/);
    return true;
  });
});

test('original image check releases decoded pixels on success and mismatch', async t => {
  let closed = 0;
  t.mock.method(globalThis, 'createImageBitmap', async () => ({ width: 960, height: 1280, close() { closed++; } }));
  await verifyWorkshopImageSize('original-image', '960x1280');
  await assert.rejects(verifyWorkshopImageSize('original-image', '1024x1024'), { recoveryRequired: true });
  assert.equal(closed, 2);
});

test('unreadable original stays recoverable instead of becoming a successful delivery', async () => {
  await assert.rejects(verifyWorkshopImageSize('unavailable', '960x1280'), { recoveryRequired: true, retryable: false });
});

test('redraw keeps a supported frozen size and refuses silent provider normalization', () => {
  assert.equal(resolveWorkshopImageSize('3:4', 'gpt-image-2', 'high', '1248x1664'), '1248x1664');
  assert.throws(() => resolveWorkshopImageSize('3:4', 'gpt-image-2', 'high', '400x600'), /未提交计费任务/);
});
