import { describe, expect, it } from 'vitest';
import {
  classifyActionShotType,
  computeAssetWeight,
  pickActionSet,
  pickWeightedRandom,
  seededShuffle,
  stableAssetCode,
} from '../assetSampling';

describe('stableAssetCode', () => {
  it('derives stable code from id suffix', () => {
    expect(stableAssetCode('S', 'clx9a1b2c3d4e5f6')).toMatch(/^S-[a-z0-9]{4}$/);
    expect(stableAssetCode('S', 'clx9a1b2c3d4e5f6')).toBe(stableAssetCode('S', 'clx9a1b2c3d4e5f6'));
  });
});

describe('computeAssetWeight', () => {
  it('penalizes high usageCount when not favorite', () => {
    const low = computeAssetWeight({ id: 'a', usageCount: 0 });
    const high = computeAssetWeight({ id: 'b', usageCount: 5 });
    expect(low).toBeGreaterThan(high);
  });

  it('boosts favorites', () => {
    const fav = computeAssetWeight({ id: 'a', isFavorite: true, usageCount: 5 });
    const plain = computeAssetWeight({ id: 'b', usageCount: 0 });
    expect(fav).toBeGreaterThan(plain);
  });
});

describe('pickWeightedRandom', () => {
  const pool = [
    { id: 's1', usageCount: 0 },
    { id: 's2', usageCount: 10 },
    { id: 's3', usageCount: 1 },
  ];

  it('excludes previously used ids when pool is large enough', () => {
    const { picked } = pickWeightedRandom(pool, 42, new Set(['s1', 's3']), 1);
    expect(picked).toHaveLength(1);
    expect(picked[0].id).toBe('s2');
  });

  it('is deterministic for same seed', () => {
    const a = pickWeightedRandom(pool, 99, new Set(), 1);
    const b = pickWeightedRandom(pool, 99, new Set(), 1);
    expect(a.picked[0]?.id).toBe(b.picked[0]?.id);
  });
});

describe('pickActionSet', () => {
  const actions = [
    { id: 'a1', title: '手腕微距特写', shotType: 'macro_detail' },
    { id: 'a2', title: '45度侧颜', shotType: 'profile_45' },
    { id: 'a3', title: '托腮互动', shotType: 'interaction' },
    { id: 'a4', title: '生活随拍', shotType: 'half_body' },
    { id: 'a5', title: '窗边氛围', shotType: 'lifestyle' },
  ];

  it('picks distinct actions across layers', () => {
    const picked = pickActionSet(actions, 7, new Set(), 4);
    expect(picked).toHaveLength(4);
    expect(new Set(picked.map((p) => p.id)).size).toBe(4);
  });

  it('prefers non-excluded action ids when picking one', () => {
    const picked = pickActionSet(actions, 7, new Set(['a1', 'a2', 'a3', 'a4']), 1);
    expect(picked).toHaveLength(1);
    expect(picked[0]?.id).toBe('a5');
  });
});

describe('classifyActionShotType', () => {
  it('detects macro from title', () => {
    expect(classifyActionShotType(undefined, '佩戴部位超清微距特写')).toBe('macro_detail');
  });
});

describe('seededShuffle', () => {
  it('preserves elements', () => {
    const input = [1, 2, 3, 4, 5];
    const out = seededShuffle(input, 3);
    expect(out.sort()).toEqual(input.sort());
  });
});
