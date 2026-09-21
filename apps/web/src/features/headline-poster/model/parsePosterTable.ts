import { COVER_FORMATS, parseCoverFormat } from '../coverFormat';
import {
  cleanCell,
  makeId,
  normalizeProductName,
  type PosterItem,
} from './posterTypes';

export const IMAGE_HEADERS = /^(?:封面|商品|图片|图像).*(?:链接|地址|图)?$|^(?:image|imageurl|url|link)$/i;
export const TITLE_HEADERS = /(?:标题|文案|title|caption|主题)/i;
export const FORMAT_HEADERS = /(?:文字.*(?:竖|横|方向)|(?:版式|画幅|尺寸|规格|比例|format|aspect))/i;
export const PRODUCT_NAME_HEADERS = /(?:商品|产品).*(?:名称|名|型号)|^(?:品牌(?:型号)?|型号|机型|product(?:name)?|model)$/i;

export function parseTable(rawRows: unknown[][]): PosterItem[] {
  const rows = rawRows
    .map((row) => row.map(cleanCell))
    .filter((row) => row.some(Boolean));
  if (rows.length === 0) return [];

  const headers = rows[0] || [];
  const imageColumn = headers.findIndex((cell) => IMAGE_HEADERS.test(cell.replace(/\s/g, '')));
  const titleColumn = headers.findIndex((cell) => TITLE_HEADERS.test(cell));
  const formatColumn = headers.findIndex((cell) => FORMAT_HEADERS.test(cell.replace(/\s/g, '')));
  const productNameColumn = headers.findIndex((cell) => PRODUCT_NAME_HEADERS.test(cell.replace(/\s/g, '')));
  const hasHeader = imageColumn >= 0 || titleColumn >= 0;
  const startRow = hasHeader ? 1 : 0;
  const imageIndex = imageColumn >= 0 ? imageColumn : 0;
  const titleIndex = titleColumn >= 0 ? titleColumn : 1;
  const formatIndex = formatColumn >= 0 ? formatColumn : 2;
  const productNameIndex = productNameColumn >= 0 ? productNameColumn : 3;

  return rows.slice(startRow).flatMap((row) => {
    const sourceImageUrl = row[imageIndex]?.trim();
    const originalTitle = row[titleIndex]?.trim();
    const formatValue = row[formatIndex]?.trim();
    const productName = normalizeProductName(row[productNameIndex] || '');
    if (!sourceImageUrl && !originalTitle) return [];
    const format = parseCoverFormat(formatValue);
    return [{
      id: makeId(),
      sourceImageUrl,
      originalTitle,
      productName,
      format: format || COVER_FORMATS.portrait,
      coverTitle: originalTitle,
      status: format ? 'idle' as const : 'failed' as const,
      error: format ? undefined : `第三列版式「${formatValue}」无法识别，请填写“文字竖”（720 × 960）或“文字横”（1440 × 1440）`,
    }];
  });
}
