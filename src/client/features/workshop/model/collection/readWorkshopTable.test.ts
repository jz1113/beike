import { describe, expect, it } from 'vitest';
import { readWorkshopTable } from './readWorkshopTable';

describe('workshop CSV input', () => {
  it('reads Chinese headers without a BOM and preserves long product IDs as text', async () => {
    const file = new File(['商品ID,商品名称,需要数量\r\n1234567890123456,手提包,2'], '商品任务.csv');
    const table = await readWorkshopTable(file);
    expect(table.errors).toEqual([]);
    expect(table.rows[0]).toMatchObject({ source: '1234567890123456', title: '手提包', count: 2 });
  });
});
