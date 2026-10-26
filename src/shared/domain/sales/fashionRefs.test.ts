import { describe, expect, it } from 'vitest';
import { fashionBeatLabel, isFashionBeat } from './fashionRefs';

describe('fashion narrative choices', () => {
  it('labels supported narratives without implying fixed reference slots', () => {
    expect(fashionBeatLabel('lifestyle')).toBe('生活穿搭');
    expect(fashionBeatLabel('unbox')).toBe('开箱换装');
    expect(fashionBeatLabel('accessory')).toBe('鞋包展示');
    expect(fashionBeatLabel('unknown')).toBe('');
    expect(isFashionBeat('lifestyle')).toBe(true);
    expect(isFashionBeat('generic')).toBe(false);
  });
});
