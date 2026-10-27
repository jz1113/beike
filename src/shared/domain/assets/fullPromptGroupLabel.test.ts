import { describe, expect, it } from 'vitest';
import { compareFullPromptGroupOrder, fullPromptGroupLabel } from './fullPromptGroupLabel';

describe('persisted library group numbers', () => {
  it('uses a consistent minimum width without truncating larger numbers', () => {
    expect([1, 9, 16, 27, 100, 1001].map(fullPromptGroupLabel)).toEqual(['图组 01', '图组 09', '图组 16', '图组 27', '图组 100', '图组 1001']);
  });

  it.each([undefined, null, 0, -1, 1.5, NaN, Infinity, '16', Number.MAX_SAFE_INTEGER + 1])('does not invent a visible identity for invalid number %s', number => {
    expect(fullPromptGroupLabel(number)).toBe('未编号图组');
  });

  it('preserves identities and sorts numerically across filtering and reordering', () => {
    const items = [{ id: 'last', displayNumber: 27 }, { id: 'ten', displayNumber: 10 }, { id: 'second', displayNumber: 2 }];
    const filtered = items.filter(item => item.id !== 'second').sort(compareFullPromptGroupOrder);
    expect(filtered.map(item => fullPromptGroupLabel(item.displayNumber))).toEqual(['图组 10', '图组 27']);
    expect([...items].sort(compareFullPromptGroupOrder).map(item => item.displayNumber)).toEqual([2, 10, 27]);
    expect(items.map(item => item.displayNumber)).toEqual([27, 10, 2]);
  });
});
