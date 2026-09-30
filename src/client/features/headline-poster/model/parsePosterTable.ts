import { COVER_FORMATS, parseCoverFormat } from './coverFormat';
import { assertPosterImportRowCount } from './posterImportLimits';
import {
  cleanCell,
  isPosterImageUrl,
  makeId,
  normalizeProductName,
  posterInputError,
  type PosterItem,
} from './posterTypes';

export const IMAGE_HEADERS = /^(?:(?:封面|商品|产品|参考|原始|主)?(?:图片|图像|图)?(?:链接|地址|url)|(?:封面|商品|产品|参考|原始|主)(?:图片|图像|图)|封面|图片|图像|image(?:url|link)?|url|link)$/i;
export const TITLE_HEADERS = /^(?:原(?:始)?标题|标题|封面(?:标题|文案)|原文案|文案|内容标题|标题文案|主题|originaltitle|title|caption)$/i;
export const FORMAT_HEADERS = /^(?:文字(?:竖横|横竖|方向|朝向)|(?:封面|图片|图像|输出)?(?:版式|画幅|尺寸|规格|比例)|format|aspect(?:ratio)?)$/i;
export const PRODUCT_NAME_HEADERS = /^(?:(?:商品|产品)(?:名称|名|型号|名称型号|名称及型号)|品牌(?:型号)?|型号|机型|product(?:name|model)?|model)$/i;

function headerName(value: string): string {
  return value.normalize('NFKC').replace(/[\s/_:()（）-]+/g, '');
}

export function parseTable(rawRows: unknown[][]): PosterItem[] {
  const rows = rawRows
    .map((row) => row.map(cleanCell))
    .filter((row) => row.some(Boolean));
  if (rows.length === 0) return [];

  const headers = rows[0] || [];
  const imageColumn = headers.findIndex((cell) => IMAGE_HEADERS.test(headerName(cell)));
  const titleColumn = headers.findIndex((cell) => TITLE_HEADERS.test(headerName(cell)));
  const formatColumn = headers.findIndex((cell) => FORMAT_HEADERS.test(headerName(cell)));
  const productNameColumn = headers.findIndex((cell) => PRODUCT_NAME_HEADERS.test(headerName(cell)));
  // A source URL identifies a data row even when its title happens to be “标题”.
  const recognizedColumns = [imageColumn, titleColumn, formatColumn, productNameColumn].filter((column) => column >= 0).length;
  const hasHeader = (imageColumn >= 0 || recognizedColumns >= 2)
    && !headers.some((cell) => isPosterImageUrl(cell) || /^https?:\/\//i.test(cell));
  const startRow = hasHeader ? 1 : 0;
  // Positional fallbacks are for headerless imports only. With named columns,
  // a missing optional field must not consume another column's value.
  const imageIndex = hasHeader ? imageColumn : 0;
  const titleIndex = hasHeader ? titleColumn : 1;
  const formatIndex = hasHeader ? formatColumn : 2;
  const productNameIndex = hasHeader ? productNameColumn : 3;
  assertPosterImportRowCount(rows.length - startRow);

  return rows.slice(startRow).flatMap((row) => {
    const sourceImageUrl = row[imageIndex]?.trim() || '';
    const originalTitle = row[titleIndex]?.trim() || '';
    const formatValue = row[formatIndex]?.trim() || '';
    const productName = normalizeProductName(row[productNameIndex] || '');
    if (!sourceImageUrl && !originalTitle && !formatValue && !productName) return [];
    const format = parseCoverFormat(formatValue);
    const importError = !format
      ? `版式「${formatValue}」无法识别，请填写“文字竖”（720 × 960）或“文字横”（1440 × 1440）后重新导入`
      : posterInputError({ sourceImageUrl, originalTitle, productName });
    return [{
      id: makeId(),
      sourceImageUrl,
      originalTitle,
      productName,
      format: format || COVER_FORMATS.portrait,
      coverTitle: originalTitle,
      status: importError ? 'failed' as const : 'idle' as const,
      importError,
      error: importError,
    }];
  });
}
