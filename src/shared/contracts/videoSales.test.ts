import { describe, expect, it } from 'vitest';
import { collectResponseSchema, collectVariantMetadataSchema } from './catalog';
import { videoSalesAnalyzeBodySchema, videoSalesFinalizeBodySchema, videoSalesFinalizeResponseSchema,
  videoSalesScriptGenerateBodySchema, videoSalesScriptPlanSchema, videoSalesSelectBodySchema } from './videoSales';

const catalog = [{ index: 2, url: 'https://example.com/white.jpg', role: 'main' }];
const workflow = { workflowVersion: 3, imageCatalog: catalog, eligibleImageIndexes: [2] };
const shots = [{ shotId: 1, imageIndex: 2, duration: 15, speechMode: 'voiceover', voiceover: '看看这件上衣' }];
const actualReferences = [{ id: 'product', kind: 'product', label: '商品', url: catalog[0].url }];
const asset = { id: 'scene', kind: 'scene', label: '场景', prompt: '实拍房间', required: true };
const finalize = { ...workflow, category: 'fashion', shots, assets: [asset], actualReferences, operation: 'finalize', targetDuration: 15, aspectRatio: '16:9' };

describe('current fashion sales contracts', () => {
  it('requires the current protocol and fashion category before any new creation', () => {
    const request = { ...workflow, productName: '上衣', category: 'fashion', targetDuration: 15, aspectRatio: '16:9' };
    expect(videoSalesScriptGenerateBodySchema.parse(request).videoMode).toBe('live_presenter');
    for (const patch of [{ workflowVersion: undefined }, { category: 'home' }, { category: undefined }, { targetDuration: undefined }, { aspectRatio: undefined }]) {
      expect(videoSalesScriptGenerateBodySchema.safeParse({ ...request, ...patch }).success).toBe(false);
    }
    expect(videoSalesScriptGenerateBodySchema.safeParse({ productName: '上衣' }).success).toBe(false);
  });

  it('rejects retired generation parameters rather than silently accepting them', () => {
    for (const field of ['templateId', 'characterId', 'platforms', 'fashionReferences', 'productImages', 'priceRange']) {
      expect(videoSalesScriptGenerateBodySchema.safeParse({ ...workflow, productName: '上衣', category: 'fashion', targetDuration: 15, aspectRatio: '9:16', [field]: 'retired' }).success).toBe(false);
    }
    expect(videoSalesFinalizeBodySchema.safeParse({ ...finalize, referenceOrder: [] }).success).toBe(false);
    expect(videoSalesFinalizeBodySchema.safeParse({ ...finalize, operation: 'validate-assets' }).success).toBe(false);
  });

  it('requires an allowlist on all current catalog operations', () => {
    for (const [schema, request] of [
      [videoSalesAnalyzeBodySchema, { ...workflow, productName: '上衣', category: 'fashion' }],
      [videoSalesScriptGenerateBodySchema, { ...workflow, productName: '上衣', category: 'fashion', targetDuration: 15, aspectRatio: '16:9' }],
      [videoSalesSelectBodySchema, { ...workflow, shots }],
      [videoSalesFinalizeBodySchema, finalize],
    ] as const) {
      expect(schema.safeParse(request).success).toBe(true);
      for (const eligibleImageIndexes of [undefined, [9], [2, 2]]) expect(schema.safeParse({ ...request, eligibleImageIndexes }).success).toBe(false);
    }
  });

  it('requires explicit speech sources and exact final timing', () => {
    expect(videoSalesFinalizeBodySchema.safeParse(finalize).success).toBe(true);
    for (const patch of [{ targetDuration: 16 }, { shots: [{ ...shots[0], speechMode: undefined }] }, { shots: [{ ...shots[0], imageIndex: 9 }] }, { actualReferences: [actualReferences[0], actualReferences[0]] }]) {
      expect(videoSalesFinalizeBodySchema.safeParse({ ...finalize, ...patch }).success).toBe(false);
    }
    expect(videoSalesFinalizeResponseSchema.safeParse({ success: true, fullPrompt: '完整视频', prompts: [{ shotId: 1, prompt: '镜头定稿' }] }).success).toBe(true);
  });

  it('requires per-asset product evidence and ordered dependencies', () => {
    const person = { ...asset, id: 'person', kind: 'person', usesProduct: true, productImageIndexes: [2] };
    const face = { ...asset, id: 'face', kind: 'face', referenceAssetIds: ['person'] };
    expect(videoSalesScriptPlanSchema.safeParse({ deliveryMode: 'single', assets: [person, face] }).success).toBe(true);
    expect(videoSalesScriptPlanSchema.safeParse({ deliveryMode: 'single', assets: [face, person] }).success).toBe(false);
    expect(videoSalesScriptPlanSchema.safeParse({ deliveryMode: 'single', assets: [{ ...person, productImageIndexes: undefined }] }).success).toBe(false);
    for (const patch of [{ productImageIndexes: [] }, { productImageIndexes: [2, 2] }, { usesProduct: false }]) {
      expect(videoSalesScriptPlanSchema.safeParse({ deliveryMode: 'single', assets: [{ ...person, ...patch }] }).success).toBe(false);
    }
  });
});

describe('collection variant metadata contract', () => {
  it('preserves versioned color, SKU identity and source images', () => {
    const variantMetadata = {
      version: 1, variants: [{ id: 'white', label: '白色', color: '白色', skuIds: ['sku-1'], imageUrls: [catalog[0].url] }],
      requestedSkuId: 'sku-1', selectedVariantId: 'white',
    };
    expect(collectVariantMetadataSchema.parse(variantMetadata)).toEqual(variantMetadata);
    const response = collectResponseSchema.parse({ success: true, product: { title: '纸巾', variantMetadata }, images: { main: [catalog[0].url], variantMetadata } });
    expect(response.product?.variantMetadata).toEqual(variantMetadata);
    expect(response.images?.variantMetadata).toEqual(variantMetadata);
    expect(collectVariantMetadataSchema.safeParse({ ...variantMetadata, version: 2 }).success).toBe(false);
  });
});
