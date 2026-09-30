import type { BatchTaskItem } from './collectorTypes';
import { detectPlatformFromText, extractUrlsFromRawText } from './collectorTypes';

export interface CollectorImportEntry {
  url: string;
  platform: BatchTaskItem['platform'];
  title?: string;
}

export interface CollectorImportCell {
  value: string;
  hyperlink?: string;
  unsafeNumber?: boolean;
  location?: string;
}

const LINK_HEADERS = /^(商品链接|作品链接|社媒链接|链接|url|link|商品地址|商品id|商品编号|sku|skuid|itemid)$/i;
const PLATFORM_HEADERS = /^(所属平台|平台|platform)$/i;
const TITLE_HEADERS = /^(商品名称|商品标题|名称|标题|title|name)$/i;

function readPlatform(value: string): BatchTaskItem['platform'] | undefined {
  const name = value.trim().toLowerCase();
  if (/^(jd|京东)$/.test(name)) return 'jd';
  if (/^(taobao|tmall|淘宝|天猫|淘宝\/天猫)$/.test(name)) return 'taobao';
  if (/^(1688|阿里巴巴)$/.test(name)) return '1688';
  if (/^(pinduoduo|pdd|拼多多)$/.test(name)) return 'pinduoduo';
  if (/^(social|社媒|小红书|抖音|快手|微博|b站|bilibili)$/.test(name)) return 'social';
  return undefined;
}

/** Read actual cells rather than XML IDs, row numbers or unused shared strings. */
export function extractCollectorRows(rows: CollectorImportCell[][]): CollectorImportEntry[] {
  if (rows.length === 0) return [];
  const header = rows[0].map((cell) => cell.value.trim());
  const linkColumns = header.flatMap((name, index) => LINK_HEADERS.test(name) ? [index] : []);
  const platformColumn = header.findIndex((name) => PLATFORM_HEADERS.test(name));
  const titleColumn = header.findIndex((name) => TITLE_HEADERS.test(name));
  const hasHeader = linkColumns.length > 0 || platformColumn >= 0 || titleColumn >= 0;
  const entries: CollectorImportEntry[] = [];
  for (const row of rows.slice(hasHeader ? 1 : 0)) {
    const platformHint = platformColumn >= 0 ? readPlatform(row[platformColumn]?.value || '') : undefined;
    const title = titleColumn >= 0 ? row[titleColumn]?.value.trim() || undefined : undefined;
    const cells = linkColumns.length > 0 ? linkColumns.map((index) => row[index]).filter(Boolean) : row;
    for (const cell of cells) {
      if (cell.unsafeNumber && !cell.hyperlink) {
        throw new Error(`${cell.location || '商品 ID 单元格'} 的数字超过 Excel 的 15 位精度，请将商品 ID 设为文本格式并重新填写原始 ID 后导入`);
      }
      for (const url of extractUrlsFromRawText(cell.hyperlink || cell.value)) {
        // Links determine their platform; an explicit column disambiguates a bare numeric ID.
        const platform = /^\d+$/.test(url) && platformHint ? platformHint : detectPlatformFromText(url);
        entries.push({ url, platform, title });
      }
    }
  }
  return entries;
}

function checkImportCancellation(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('导入已取消', 'AbortError');
}

export async function readCollectorFile(file: File, signal?: AbortSignal): Promise<CollectorImportEntry[]> {
  checkImportCancellation(signal);
  if (file.size > 10 * 1024 * 1024) throw new Error('文件超过 10 MB，请拆分后导入');
  if (!/\.(xlsx|xls|csv|tsv|txt)$/i.test(file.name)) throw new Error('请上传 .xlsx、.xls、.csv、.tsv 或 .txt 文件');
  if (/\.txt$/i.test(file.name)) {
    const text = await file.text();
    checkImportCancellation(signal);
    return extractUrlsFromRawText(text).map((url) => ({ url, platform: detectPlatformFromText(url) }));
  }

  // Loaded only when a spreadsheet is imported; xls and xlsx use their real formats.
  const XLSX = await import('xlsx');
  checkImportCancellation(signal);
  const isText = /\.(csv|tsv)$/i.test(file.name);
  const contents = isText ? await file.text() : await file.arrayBuffer();
  checkImportCancellation(signal);
  const workbook = XLSX.read(contents, { type: isText ? 'string' : 'array', raw: isText, cellHTML: false, cellText: false });
  const entries: CollectorImportEntry[] = [];
  let cellCount = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    cellCount += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
    if (cellCount > 200_000) throw new Error('表格范围超过 20 万个单元格，请删除多余空白区域或拆分文件');
    const rows: CollectorImportCell[][] = [];
    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
      if ((rowIndex - range.s.r) % 256 === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        checkImportCancellation(signal);
      }
      const row: CollectorImportCell[] = [];
      for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
        const unsafeNumber = typeof cell?.v === 'number' && Number.isInteger(cell.v) && Math.abs(cell.v) >= 1e15;
        row.push({ value: cell?.v == null ? '' : String(cell.v), hyperlink: cell?.l?.Target,
          unsafeNumber, location: `「${sheetName}」${XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })}` });
      }
      if (row.some((cell) => cell.value || cell.hyperlink)) rows.push(row);
    }
    entries.push(...extractCollectorRows(rows));
  }
  return entries;
}
