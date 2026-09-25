import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({ entryPoints: [fileURLToPath(new URL('./slotResolver.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'no-network', setup(build) {
    build.onLoad({ filter: /gatewayCredentials\.ts$/ }, () => ({ contents: 'export async function fetchImageAsSafeDataUrl(url) { return url === "unreadable" ? null : url || null; }' }));
    build.onLoad({ filter: /faceObfuscate\.ts$/ }, () => ({ contents: 'export async function emphasizeIdentityFacePlate(url) { return url; }' }));
  } }],
});
const { resolveImageSlotsAndPrompt } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('workshop cannot bypass mandatory product reference by disabling the client toggle', async () => {
  for (const productImageUrl of [undefined, 'unreadable']) {
    const result = await resolveImageSlotsAndPrompt({ prompt: '手机静物', workshopMode: 'storyboard_generate', useReferenceImage: false, productImageUrl });
    assert.match(result.error, /缺少商品垫图/);
  }
});

test('all workshop slots finish with the same geometry lock and product remains first', async () => {
  for (const prompt of ['@图片1 手机俯拍', '手机摄像头模组局部特写', '2x2四宫格手机图']) {
    const result = await resolveImageSlotsAndPrompt({ prompt, workshopMode: 'storyboard_generate', productImageUrl: 'product', anchorFaceImageUrl: 'face', sceneAnchorImageUrl: 'scene', has_human: true });
    assert.equal(result.error, undefined);
    assert.deepEqual(result.orderedSlotImages, ['product', 'face', 'scene']);
    assert.match(result.cleanedPrompt, /【商品几何保真约束】/);
    assert.match(result.cleanedPrompt, /单个视图/);
  }
});

test('plain generation without a product image remains supported', async () => {
  const result = await resolveImageSlotsAndPrompt({ prompt: '山水画', source: 'hub' });
  assert.equal(result.error, undefined);
  assert.equal(result.cleanedPrompt, '山水画');
});


test('workshop forwards supplementary product views after stable face and scene slots', async () => {
  const result = await resolveImageSlotsAndPrompt({
    prompt: '@图片1 手机正面展示',
    workshopMode: 'storyboard_generate',
    productImageUrl: 'product-front',
    productReferenceImages: ['product-front', 'product-back', 'product-detail'],
    anchorFaceImageUrl: 'face',
    sceneAnchorImageUrl: 'scene',
    has_human: true,
    productFingerprint: '手机',
  });
  assert.deepEqual(result.orderedSlotImages, ['product-front', 'face', 'scene', 'product-back', 'product-detail']);
  assert.match(result.cleanedPrompt, /补充视图/);
  assert.match(result.cleanedPrompt, /屏幕比例/);
});
