import { z } from 'zod';
import { eligibleSalesImages, type SalesColorSelection } from '@shared/domain/sales';
import { salesSummaryInputSchema, salesSummaryResponseSchema, salesSummaryResultSchema, type SalesSummaryInput, type SalesSummaryResult } from '@shared/contracts/salesSummary';
import type { CollectedSalesProduct } from './productLink';
import type { SalesOCRState } from './salesOCR';

const resultShape = salesSummaryResultSchema.innerType().innerType();
/** Draft editors may temporarily clear fields without losing the rest of the saved result. */
const savedResultSchema = resultShape.extend({
  summary: z.string().max(1000),
  points: z.array(resultShape.shape.points.element.extend({
    feature: z.string().max(1000),
    benefit: z.string().max(1000),
    expression: z.string().max(1000),
  })).max(6),
}).refine((result) => new Set(result.copyPointIndexes).size === result.copyPointIndexes.length && result.copyPointIndexes.every((index) => index <= result.points.length));
const savedSummarySchema = salesSummaryResponseSchema.omit({ success: true }).extend({
  result: savedResultSchema,
  inputKey: z.string().min(1).max(400_000),
  generatedAt: z.string().datetime(),
  editedCopy: z.string().max(4000).optional(),
});
export type SavedSalesSummary = z.infer<typeof savedSummarySchema>;
export function parseSavedSalesSummary(value: unknown): SavedSalesSummary | undefined {
  const parsed = savedSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Use the current queue's latest edits; historical notes stay local. */
type SummarySource = Pick<CollectedSalesProduct, 'productName' | 'brand' | 'sellingPoints' | 'props' | 'imageCatalog' | 'variantMetadata'> & Pick<SalesOCRState, 'ocrImages' | 'ocrImageUrls'> & { colorSelection: SalesColorSelection };
export function salesSummarySource(state: SummarySource): { input: SalesSummaryInput; inputKey: string; error: string; referenceCount: number; textCount: number } {
  const references = eligibleSalesImages(state.imageCatalog, state.colorSelection, state.variantMetadata);
  const queued = state.imageCatalog.filter((image) => state.ocrImageUrls.includes(image.url));
  const textImages = queued.flatMap((image) => {
    const entry = state.ocrImages.find((item) => item.imageUrl === image.url);
    return !image.unavailable && entry?.editedText.trim()
      ? [{ index: image.index, url: image.url, text: entry.editedText.trim() }] : [];
  });
  const input: SalesSummaryInput = {
    productName: state.productName.trim(), brand: state.brand.trim(),
    facts: [state.sellingPoints.trim(), ...Object.entries(state.props).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}：${value}`)].filter(Boolean).join('\n'),
    referenceImages: references.map(({ index, url }) => ({ index, url })), textImages,
  };
  let error = '';
  if (!textImages.length && !state.sellingPoints.trim()) error = '请先识别文字，或补充商品文字后提炼卖点。';
  else if (new Set([...input.referenceImages, ...textImages].map((image) => image.url)).size > 16) error = '单次最多使用 16 张不同图片，请减少选图。';
  else if (!salesSummaryInputSchema.safeParse(input).success || textImages.reduce((sum, image) => sum + image.text.length, 0) > 60_000) error = '商品资料过长，请减少文字图片或精简内容后重试。';
  return { input, inputKey: JSON.stringify({ rulesVersion: 3, input }), error, referenceCount: references.length, textCount: textImages.length };
}

export function salesSummaryText(result: SalesSummaryResult): string {
  return [result.summary, ...result.points.map((point, index) => `${index + 1}. 买点：${point.benefit}\n卖点：${point.feature}\n自然表达：${point.expression}`),
    result.copy ? `推荐文案\n${result.copy}` : '',
    result.cautions?.length ? `使用与养护\n${result.cautions.join('\n')}` : '',
    result.conflicts.length ? `资料冲突\n${result.conflicts.join('\n')}` : '',
    result.questions.length ? `待确认信息\n${result.questions.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

export function salesSummarySourceLabel(id: string): string {
  if (id === 'product-meta') return '采集资料';
  return id.replace(/^image-(\d+)$/, '原图 #$1').replace(/^ocr-(\d+)$/, '核对文字 #$1');
}
