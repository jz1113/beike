import { describe, expect, it } from 'vitest';
import { buildActionDefaultAnglePatch, extractActionAngleEntries } from './salesActionViews';

describe('sales multi-angle pose action views', () => {
  it('orders 5 pose camera angles consistently and marks the explicit default angle', () => {
    const dimensions = JSON.stringify({
      customMetadata: 'standing',
      defaultAngle: 'diagonal',
      actionViews: {
        low: '/pose/low.jpg',
        front: '/pose/front.jpg',
        diagonal: '/pose/diagonal.jpg',
        side: '/pose/side.jpg',
        high: '/pose/high.jpg',
      },
    });
    const entries = extractActionAngleEntries({
      dimensions,
      coverUrl: '/pose/diagonal.jpg',
      mediaUrl: '/pose/diagonal.jpg',
    });

    expect(entries.map((item) => item.angle)).toEqual(['front', 'diagonal', 'side', 'high', 'low']);
    expect(entries.map((item) => item.shortLabel)).toEqual(['正', '斜', '侧', '俯', '仰']);
    expect(entries.find((item) => item.isDefault)?.angle).toBe('diagonal');
  });

  it('falls back to sourceImages when actionViews metadata is absent', () => {
    const entries = extractActionAngleEntries({
      sourceImages: ['/a.jpg', '/b.jpg', '/c.jpg'],
      coverUrl: '/b.jpg',
    });

    expect(entries).toHaveLength(3);
    expect(entries[1]).toMatchObject({ url: '/b.jpg', isDefault: true });
    expect(extractActionAngleEntries({ sourceImages: ['/only-one.jpg'] })).toEqual([]);
  });

  it('updates defaultAngle and cover/media URLs while preserving existing dimensions fields', () => {
    const initial = JSON.stringify({
      customMetadata: 'hand',
      defaultAngle: 'front',
      actionViews: { front: '/front.jpg', side: '/side.jpg' },
    });
    const patch = buildActionDefaultAnglePatch(initial, 'side', '/side.jpg');
    expect(patch.coverUrl).toBe('/side.jpg');
    expect(patch.mediaUrl).toBe('/side.jpg');
    expect(JSON.parse(patch.dimensions)).toEqual({
      customMetadata: 'hand',
      defaultAngle: 'side',
      actionViews: { front: '/front.jpg', side: '/side.jpg' },
    });
  });
});

