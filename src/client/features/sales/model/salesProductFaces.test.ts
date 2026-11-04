import { describe, expect, it } from 'vitest';
import { normalizeScriptTemplate, type SalesReferenceSlot } from '@shared/domain/sales';
import { parseSalesProductionPlan } from './salesProductionDraft';
import { productFaceReferences } from './salesProductFaces';
import { resolveSalesVideoSettings } from './salesVideoSettings';

const region = { x: 0.3, y: 0.1, width: 0.2, height: 0.3 };
const edits = { '/shirt': { url: '/masked-shirt', regions: [region] }, '/person': { url: '/masked-person', regions: [region] } };
const slot = (kind: SalesReferenceSlot['kind'], url: string, n: number): SalesReferenceSlot =>
  ({ kind, url, mediaType: 'image', slotIndex: n, mixedToken: `{{Mixed ${n}}}`, apiToken: `图片${n}`, label: kind });

describe('商品图人脸打码', () => {
  it('submits the reviewed copies in their original numbered slots and preserves a shared identity reference', () => {
    const materials: SalesReferenceSlot[] = [
      { ...slot('persona_identity', '/person', 1), roles: ['persona_identity', 'product'] },
      { ...slot('product', '/shirt', 2), roles: ['product', 'scene'] },
      slot('product', '/bag', 3),
      { ...slot('action', '/depth', 4), mediaType: 'video' },
    ];
    const plan = parseSalesProductionPlan({ productFaceEdits: edits });
    const script = normalizeScriptTemplate({ durationSec: 5, format: 'product', voiceMode: 'none', shots: [{ beats: [{ start: 0, end: 5, action: '展示' }] }] })!;
    const preview = productFaceReferences(materials, plan.productFaceEdits);
    expect(preview.map((ref) => ref.url)).toEqual(['/person', '/masked-shirt', '/bag', '/depth']);
    expect(preview[1]).toEqual({ ...materials[1], url: '/masked-shirt' });
    expect(resolveSalesVideoSettings(plan, script, materials)).toMatchObject({
      images: preview.slice(0, 3).map((ref) => ref.url), videos: ['/depth'],
    });
    expect(materials[1].url).toBe('/shirt');
  });

  it('restores reviewed originals and valid masks, dropping malformed saved regions', () => {
    expect(parseSalesProductionPlan({}).productFaceEdits).toEqual({});
    const clean = { ...edits, '/bag': { url: '/bag', regions: [] } };
    expect(parseSalesProductionPlan({ productFaceEdits: { ...clean,
      '/broken': { url: '/copy', regions: [{ ...region, width: 1 }] },
      '/wrong': { url: '/unrelated', regions: [] },
    } }).productFaceEdits).toEqual(clean);
  });
});
