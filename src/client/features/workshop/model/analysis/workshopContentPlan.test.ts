import { expect, it } from 'vitest';
import { buildWorkshopTableItems, parseWorkshopTable } from '../collection/workshopTableImport';
import { createContentPlan, workshopContentContext } from './workshopContentPlan';

it('assigns five distinct focuses and openings before any vision request finishes', () => {
  const plans = Array.from({ length: 5 }, (_, index) => createContentPlan(index + 1, 5));
  expect(new Set(plans.map(plan => plan.focus)).size).toBe(5);
  expect(new Set(plans.map(plan => plan.opening)).size).toBe(5);
  expect(createContentPlan(6, 10).treatment).not.toBe(plans[0].treatment);
});

it('supplies only same-SKU sibling plans and completed shot evidence', () => {
  const rows = parseWorkshopTable([['商品ID', '需要数量'], ['12345678', 3], ['87654321', 1]]).rows;
  const { items } = buildWorkshopTableItems(rows, []);
  items[0].analyzedSuccess = true;
  items[0].prompts = [{ shot_no: 1, prompt: '商品', title: '整体', scene: '窗边桌面', angle: '俯视' }];
  const context = workshopContentContext(items[1], items);
  expect(context?.current.index).toBe(2);
  expect(context?.siblings).toHaveLength(2);
  expect(context?.siblings[0].completedShots[0].scene).toBe('窗边桌面');
  expect(context?.siblings[1].completedShots).toEqual([]);
});
