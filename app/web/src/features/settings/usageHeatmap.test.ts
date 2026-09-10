import { expect, it } from 'vitest';
import { buildUsageHeatmap } from './usageHeatmap';
it('keeps calendar alignment, leap day and amount precision', () => {
  const weeks = buildUsageHeatmap({heatmapActiveMap:{'2024-02-29':2},heatmapDetailsMap:{'2024-02-29':{requests:2,tokens:17,costUsd:0.123,costRmb:0.891}}},'year',2024,new Date(2024,1,29));
  expect(weeks).toHaveLength(53);
  const day=weeks.flatMap(week=>week.days).find(day=>day.dateKey==='2024-02-29');
  expect(day).toMatchObject({dayName:'周四',count:2,tokens:17,costUsd:0.123,costRmb:0.891,isToday:true,isFuture:false});
  expect(weeks[0].days[0].dayName).toBe('周一');
});
it('keeps quarter and half-year windows at 13 and 26 full weeks', () => {
  for (const range of ['quarter','half_year'] as const) {
    const weeks=buildUsageHeatmap({heatmapActiveMap:{}},range,2026,new Date(2026,0,1));
    expect(weeks).toHaveLength(range==='quarter'?13:26);
    expect(weeks.every(week=>week.days.length===7)).toBe(true);
    expect(weeks.flatMap(week=>week.days).filter(day=>day.isToday)).toHaveLength(1);
  }
});
