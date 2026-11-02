import { expect, it } from 'vitest';
import { compareSalesAssetNames, nextSequentialSalesAssetName, salesAssetNumber } from './salesAssetNames';

it.each(['persona', 'scene'] as const)('continues the existing %s import numbering independently of custom names', (kind) => {
  const prefix = kind === 'persona' ? '人物' : '场景';
  const names = [`${prefix}12`, '新建样本', `${prefix}2`, '用户自定义', `${prefix} 003`, `${prefix}1`];
  expect(nextSequentialSalesAssetName(kind, names)).toBe(`${prefix}13`);
  expect(salesAssetNumber(kind, `${prefix}12修改版`)).toBeUndefined();
});

it.each(['人物', '女', '男', '场景', '室内', '户外', '动作', '人声', 'BGM'])('sorts every %s name in natural ascending order, including custom numbered names', (prefix) => {
  const names = [`${prefix}10`, `${prefix}2`, `${prefix} 003`, `${prefix}1`];
  expect([...names].sort(compareSalesAssetNames)).toEqual([`${prefix}1`, `${prefix}2`, `${prefix} 003`, `${prefix}10`]);
});

it('sorts unnumbered names too, without a separate custom-name group', () => {
  expect(['B2', 'A10', 'B', 'A2', 'A'].sort(compareSalesAssetNames)).toEqual(['A', 'A2', 'A10', 'B', 'B2']);
});
