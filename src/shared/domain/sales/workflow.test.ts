import { describe, expect, it } from 'vitest';
import { eligibleSalesImages, salesActualReferences, salesAssetsReady, salesAssetsGenerated, validateSalesAssetPlan } from './workflow';
import type { VideoSalesScript } from './types';

const images = [
  { index: 0, role: 'main' as const, url: '/black.jpg' },
  { index: 4, role: 'sku' as const, url: '/white.jpg' },
  { index: 7, role: 'detail' as const, url: '/unknown.jpg' },
];
const variants = { version: 1 as const, variants: [{ id: 'black', label: '曜石黑', color: '曜石黑', skuIds: ['sku-black'], imageUrls: ['/black.jpg'] }] };
const selection = { variantId: 'black', colorLabel: '曜石黑', confirmedImageUrls: [] as string[], excludedImageUrls: [] as string[] };
const script: VideoSalesScript = {
  id: 'script', title: '展示', totalDuration: 15, deliveryMode: 'single', assets: [], assetValidation: 'passed',
  shots: [{ shotId: 1, type: 'demo', duration: 15, description: '展示', camera: '中景', speechMode: 'voiceover', voiceover: '商品', visualSource: 'product_image', transition: 'direct_concat', imageIndex: 0 }],
  seo: { title: '', hashtags: [], coverText: '', interactionGuide: '', description: '' },
};

describe('sales product color eligibility', () => {
  it('keeps original indexes and allows mapped images independently from main/sku roles', () => {
    expect(eligibleSalesImages(images, selection, variants)).toEqual([images[0]]);
  });
  it('does not infer color or treat unknown legacy images as eligible', () => {
    expect(eligibleSalesImages(images, { ...selection, variantId: undefined }, undefined)).toEqual([]);
    expect(eligibleSalesImages(images, { ...selection, colorLabel: '' }, variants)).toEqual([]);
  });
  it('holds unknown variants and multi-color shared images for explicit confirmation', () => {
    expect(eligibleSalesImages(images, selection, { ...variants, variants: [{ ...variants.variants[0], color: undefined }] })).toEqual([]);
    const conflict = { ...variants, variants: [...variants.variants, { ...variants.variants[0], id: 'white', color: '白色' }] };
    expect(eligibleSalesImages(images, selection, conflict)).toEqual([]);
    expect(eligibleSalesImages(images, { ...selection, confirmedImageUrls: ['/black.jpg'] }, conflict)).toEqual([images[0]]);
  });
  it('accepts an explicit manual confirmation and preserves exclusions', () => {
    expect(eligibleSalesImages(images, { ...selection, confirmedImageUrls: ['/unknown.jpg'], excludedImageUrls: ['/black.jpg'] }, variants)).toEqual([images[2]]);
  });
  it('accepts directly selected images without a color and still rejects unavailable or excluded images', () => {
    const direct = { colorLabel: '', confirmedImageUrls: ['/black.jpg', '/unknown.jpg', '/missing.jpg'], excludedImageUrls: ['/black.jpg'] };
    expect(eligibleSalesImages(images, direct, variants)).toEqual([images[2]]);
    expect(eligibleSalesImages(images.map((image) => ({ ...image, unavailable: true })), direct, variants)).toEqual([]);
    expect(eligibleSalesImages(images, { ...direct, confirmedImageUrls: [] }, variants)).toEqual([]);
  });
  it('does not silently replace a shot reference with another selected image', () => {
    expect(() => salesActualReferences({ ...script, shots: [{ ...script.shots[0], imageIndex: 4 }] }, [images[0]])).toThrow('未被选中');
    expect(salesActualReferences(script, [images[0]])).toEqual([{ id: 'product-0', kind: 'product', label: '商品参考 1', url: '/black.jpg' }]);
  });
});

describe('creative image plan safety', () => {
  it('requires face close-ups to inherit the same previously planned person', () => {
    expect(() => validateSalesAssetPlan([])).toThrow('1 至 4');
    expect(() => validateSalesAssetPlan([{ id: 'face', kind: 'face', label: '人脸', prompt: '特写', required: true }])).toThrow('同一');
    expect(() => validateSalesAssetPlan([
      { id: 'person', kind: 'person', label: '人物', prompt: '成年人物', required: true },
      { id: 'face', kind: 'face', label: '人脸', prompt: '同一人', required: true, referenceAssetIds: ['person'] },
    ])).not.toThrow();
  });
  it('requires real completed validated images, not only prompt strings', () => {
    expect(salesAssetsReady(script)).toBe(true);
    expect(salesAssetsReady({ ...script, planStale: true })).toBe(false);
    expect(salesAssetsReady({ ...script, assets: [{ id: 'scene', kind: 'scene', label: '场景', prompt: '房间', required: true }] })).toBe(false);
    expect(salesAssetsReady({ ...script, assets: [{ id: 'scene', kind: 'scene', label: '场景', prompt: '房间', required: true, url: '/scene.jpg', status: 'done', validation: 'conflict' }] })).toBe(false);
  });
  it('requires manual confirmation even when an old automatic validation passed', () => {
    const asset = { id: 'scene', kind: 'scene' as const, label: '场景', prompt: '房间', required: true, url: '/scene.jpg', status: 'done' as const, validation: 'passed' as const };
    expect(salesAssetsGenerated({ ...script, assets: [asset] })).toBe(true);
    expect(salesAssetsReady({ ...script, assets: [asset] })).toBe(false);
    expect(salesAssetsReady({ ...script, assets: [{ ...asset, validationSource: 'manual' }] })).toBe(true);
  });
});

it.each(['generating', 'uncertain'] as const)('does not ignore an unresolved optional image: %s', (status) => {
  const pending = { ...script, assets: [{ id: 'scene', kind: 'scene' as const, label: '场景', prompt: '房间', required: false, status, submissionKey: 'saved-key' }] };
  expect(salesAssetsGenerated(pending)).toBe(false);
  expect(salesAssetsReady(pending)).toBe(false);
});
