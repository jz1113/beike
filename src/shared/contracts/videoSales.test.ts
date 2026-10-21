import { describe, expect, it } from 'vitest';
import { collectResponseSchema, collectVariantMetadataSchema } from './catalog';
import {
  videoSalesAnalyzeBodySchema, videoSalesFinalizeBodySchema, videoSalesFinalizeResponseSchema,
  videoSalesScriptGenerateBodySchema, videoSalesScriptPlanSchema, videoSalesSelectBodySchema,
  videoSalesValidateAssetsResponseSchema,
} from './videoSales';

const catalog = [{ index: 2, url: 'https://example.com/white.jpg', role: 'main' }];
const workflow = { workflowVersion: 3, imageCatalog: catalog, eligibleImageIndexes: [2] };
const shots = [{ shotId: 1, imageIndex: 2, duration: 15, voiceover: '看看这款纸巾' }];
const actualReferences = [{ id: 'product', kind: 'product', label: '商品', url: catalog[0].url }];

describe('video sales version 3 contracts', () => {
  it('keeps supported speech modes and rejects unknown voice sources', () => {
    const request = { ...workflow, shots: [{ ...shots[0], speechMode: 'on_camera' }], actualReferences, operation: 'validate-assets' };
    expect(videoSalesFinalizeBodySchema.parse(request).shots[0].speechMode).toBe('on_camera');
    expect(videoSalesSelectBodySchema.parse(request).shots[0].speechMode).toBe('on_camera');
    expect(videoSalesFinalizeBodySchema.safeParse({ ...request, shots: [{ ...shots[0], speechMode: 'unknown' }] }).success).toBe(false);
  });

  it('keeps legacy script defaults and legacy finalize requests', () => {
    const result = videoSalesScriptGenerateBodySchema.parse({ productName: '纸巾' });
    expect(result.targetDuration).toBe(15);
    expect(result.category).toBe('beauty');
    expect(videoSalesFinalizeBodySchema.safeParse({ shots, imageCatalog: catalog }).success).toBe(true);
  });

  it('requires an allowlist on every version 3 catalog operation', () => {
    const schemasAndPayloads = [
      [videoSalesAnalyzeBodySchema, { ...workflow }],
      [videoSalesScriptGenerateBodySchema, { ...workflow, productName: '纸巾', targetDuration: 15, aspectRatio: '16:9' }],
      [videoSalesSelectBodySchema, { ...workflow, shots }],
      [videoSalesFinalizeBodySchema, { ...workflow, shots, actualReferences, operation: 'validate-assets' }],
    ] as const;
    for (const [schema, payload] of schemasAndPayloads) {
      expect(schema.safeParse(payload).success).toBe(true);
      expect(schema.safeParse({ ...payload, eligibleImageIndexes: undefined }).success).toBe(false);
      expect(schema.safeParse({ ...payload, eligibleImageIndexes: [9] }).success).toBe(false);
      expect(schema.safeParse({ ...payload, eligibleImageIndexes: [2, 2] }).success).toBe(false);
    }
  });

  it('plans scripts without a video model or person picture but requires explicit timing and ratio', () => {
    const request = { ...workflow, productName: '纸巾', targetDuration: 15, aspectRatio: '16:9', selectedColor: '白色' };
    expect(videoSalesScriptGenerateBodySchema.safeParse(request).success).toBe(true);
    expect(videoSalesScriptGenerateBodySchema.safeParse({ ...request, targetDuration: undefined }).success).toBe(false);
    expect(videoSalesScriptGenerateBodySchema.safeParse({ ...request, aspectRatio: undefined }).success).toBe(false);
    expect(videoSalesScriptGenerateBodySchema.parse(request).selectedColor).toBe('白色');
  });

  it('accepts ordered face dependency on a person and rejects a cycle', () => {
    const person = { id: 'person', kind: 'person', label: '人物', prompt: '实拍人物', required: true };
    const face = { id: 'face', kind: 'face', label: '人脸', prompt: '实拍人脸', required: true, referenceAssetIds: ['person'] };
    expect(videoSalesScriptPlanSchema.safeParse({ deliveryMode: 'single', assets: [person, face] }).success).toBe(true);
    expect(videoSalesScriptPlanSchema.safeParse({ deliveryMode: 'single', assets: [face, person] }).success).toBe(false);
    expect(videoSalesScriptPlanSchema.safeParse({ deliveryMode: 'single', assets: [person, person] }).success).toBe(false);
  });

  it('requires a complete actual-image operation and exact duration', () => {
    const request = { ...workflow, shots, actualReferences, operation: 'finalize', targetDuration: 15, aspectRatio: '16:9' };
    expect(videoSalesFinalizeBodySchema.safeParse(request).success).toBe(true);
    expect(videoSalesFinalizeBodySchema.safeParse({ ...request, targetDuration: 16 }).success).toBe(false);
    expect(videoSalesFinalizeBodySchema.safeParse({ ...request, actualReferences: [actualReferences[0], actualReferences[0]] }).success).toBe(false);
    expect(videoSalesFinalizeBodySchema.safeParse({ ...request, shots: [{ ...shots[0], imageIndex: 9 }] }).success).toBe(false);
    expect(videoSalesFinalizeBodySchema.safeParse({ ...request, operation: 'unknown' }).success).toBe(false);
    expect(videoSalesFinalizeBodySchema.safeParse({ ...request, workflowVersion: undefined }).success).toBe(false);
  });

  it('defines tri-state validation and whole-video responses without still prompts', () => {
    expect(videoSalesValidateAssetsResponseSchema.safeParse({ success: true, validations: [{ id: 'person', status: 'uncertain', reason: '图片不可辨认' }] }).success).toBe(true);
    expect(videoSalesValidateAssetsResponseSchema.safeParse({ success: true, validations: [{ id: 'person', status: 'ok', reason: '未知状态' }] }).success).toBe(false);
    expect(videoSalesFinalizeResponseSchema.safeParse({ success: true, fullPrompt: '完整视频', prompts: [{ shotId: 1, prompt: '镜头定稿' }] }).success).toBe(true);
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
