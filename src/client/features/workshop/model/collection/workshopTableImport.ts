import type { BatchProductItem } from '../batchTypes';
import { parseWorkshopProduct } from './parseWorkshopProduct';
import { createContentPlan } from '../analysis/workshopContentPlan';

export const MAX_IMPORT_PRODUCTS = 20;
export const MAX_BATCH_CONTENTS = 200;
export const MAX_PRODUCT_CONTENTS = 20;
export interface WorkshopImportRow {
  key: string;
  source: string;
  title: string;
  category: string;
  count: number;
  sourceRows: number[];
  countConflict: boolean;
}
export const workshopProductKey = (item: Pick<BatchProductItem, 'platform' | 'itemId'>) => `${item.platform === 'tmall' ? 'taobao' : item.platform}:${item.itemId}`;
const cell = (value: unknown) => value == null ? '' : String(value).trim();

/** Quantity means the total requested for an SKU, never a row number or an additive order. */
export function parseWorkshopTable(matrix: unknown[][]): { rows: WorkshopImportRow[]; errors: string[] } {
  const headerIndex = matrix.findIndex(row => row.some(value => /^(商品id|商品链接|链接|sku)$/i.test(cell(value))));
  if (headerIndex < 0) throw new Error('未找到表头，请包含「商品ID」或「商品链接」及「需要数量」列');
  const headers = matrix[headerIndex].map(value => cell(value).toLowerCase());
  const column = (...names: string[]) => headers.findIndex(name => names.includes(name));
  const id = column('商品id', 'sku'), link = column('商品链接', '链接');
  const quantity = column('需要数量', '内容数量', '数量');
  if (quantity < 0) throw new Error('缺少「需要数量」列：1 表示一条完整图文，3 表示三条完整图文');
  const title = column('商品名称', '商品标题');
  const categories = ['任务类目', '二级类目', '三级类目', '商品类目'].map(name => column(name));
  const grouped = new Map<string, WorkshopImportRow>();
  const errors: string[] = [];
  matrix.slice(headerIndex + 1).forEach((row, offset) => {
    if (row.every(value => !cell(value))) return;
    const rowNo = headerIndex + offset + 2;
    const source = cell(row[link]) || cell(row[id]);
    const numericId = row[id];
    if (!cell(row[link]) && typeof numericId === 'number' && !Number.isSafeInteger(numericId)) {
      errors.push(`第 ${rowNo} 行：商品ID已超出数字精度，请在原表设为文本后重新填写`); return;
    }
    const parsed = parseWorkshopProduct(source);
    const countText = cell(row[quantity]);
    const count = Number(countText);
    if (!parsed) { errors.push(`第 ${rowNo} 行：商品ID或链接无效`); return; }
    if (!/^\d+$/.test(countText) || !Number.isSafeInteger(count) || count < 1 || count > MAX_PRODUCT_CONTENTS) {
      errors.push(`第 ${rowNo} 行：需要数量须为 1–${MAX_PRODUCT_CONTENTS} 的整数`); return;
    }
    const key = workshopProductKey(parsed);
    const previous = grouped.get(key);
    if (previous) {
      previous.countConflict ||= previous.count !== count;
      previous.count = Math.max(previous.count, count);
      previous.sourceRows.push(rowNo);
    } else {
      grouped.set(key, { key, source, title: cell(row[title]), count,
        category: [...new Set(categories.map(index => cell(row[index])).filter(Boolean))].join(' / '),
        sourceRows: [rowNo], countConflict: false });
    }
  });
  return { rows: [...grouped.values()], errors };
}

export function workshopTableAdditionCount(rows: WorkshopImportRow[], existing: BatchProductItem[]) {
  if (!rows.length) throw new Error('请先选择要加入本批的商品');
  if (new Set(rows.map(row => row.key)).size !== rows.length) throw new Error('请先合并重复 SKU');
  const productKeys = new Set([...existing.map(workshopProductKey), ...rows.map(row => row.key)]);
  if (productKeys.size > MAX_IMPORT_PRODUCTS) throw new Error(`每批最多 ${MAX_IMPORT_PRODUCTS} 款商品，请减少勾选或新建批次分批制作`);
  let count = 0;
  for (const row of rows) {
    if (!Number.isInteger(row.count) || row.count < 1 || row.count > MAX_PRODUCT_CONTENTS) throw new Error(`需要数量须为 1–${MAX_PRODUCT_CONTENTS} 的整数`);
    const parsed = parseWorkshopProduct(row.source);
    if (!parsed || workshopProductKey(parsed) !== row.key) throw new Error('商品来源无效，请重新读取表格');
    const siblings = existing.filter(item => workshopProductKey(item) === row.key);
    const indices = new Set(siblings.map((item, position) => item.contentPlan?.index || position + 1));
    for (let index = 1; index <= row.count; index++) if (!indices.has(index)) count++;
  }
  if (existing.length + count > MAX_BATCH_CONTENTS) throw new Error(`本批最多 ${MAX_BATCH_CONTENTS} 条内容，请减少数量或分批制作`);
  return count;
}

export function buildWorkshopTableItems(rows: WorkshopImportRow[], existing: BatchProductItem[]) {
  workshopTableAdditionCount(rows, existing);
  let updatedItems = [...existing];
  const newItems: BatchProductItem[] = [];
  for (const row of rows) {
    const parsed = parseWorkshopProduct(row.source)!;
    const siblings = existing.filter(item => workshopProductKey(item) === row.key);
    const indices = new Set(siblings.map((item, position) => item.contentPlan?.index || position + 1));
    const total = Math.max(row.count, ...siblings.map(item => item.contentPlan?.total || 1));
    updatedItems = updatedItems.map(item => workshopProductKey(item) === row.key && item.contentPlan
      ? { ...item, contentPlan: { ...item.contentPlan, total } } : item);
    for (let index = 1; index <= row.count; index++) {
      if (indices.has(index)) continue;
      newItems.push({ ...parsed, id: `content_${crypto.randomUUID()}`, title: row.title || `待采编商品 (${parsed.itemId})`,
        price: 0, category: row.category || '待采编', brand: '', coverImage: '', props: {}, status: 'pending', selected: true,
        mainImages: [], skuImages: [], detailImages: [], allTypedImages: [], selectedProductImages: [], prompts: [], tasks: [],
        contentPlan: createContentPlan(index, total), importCategory: row.category, importSourceRows: row.sourceRows });
    }
  }
  return { newItems, items: [...updatedItems, ...newItems] };
}
