import { z } from 'zod';
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
type SummarySource = Partial<Pick<CollectedSalesProduct, 'productName' | 'brand' | 'props' | 'sellingPoints'>> & Pick<CollectedSalesProduct, 'imageCatalog'> & Pick<SalesOCRState, 'ocrImages' | 'ocrImageUrls'>;
export function salesSummarySource(state: SummarySource): { input: SalesSummaryInput; inputKey: string; error: string; textCount: number } {
  const queued = state.imageCatalog.filter((image) => state.ocrImageUrls.includes(image.url));
  const textSources = queued.flatMap((image) => {
    const entry = state.ocrImages.find((item) => item.imageUrl === image.url);
    return entry?.editedText.trim()
      ? [{ index: image.index, text: entry.editedText.trim() }] : [];
  });
  const productFacts = [state.productName?.trim(), state.brand?.trim() && `品牌：${state.brand.trim()}`,
    ...Object.entries(state.props || {}).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}：${value}`), state.sellingPoints?.trim()].filter(Boolean).join('\n');
  const input: SalesSummaryInput = { textSources, ...(productFacts ? {productFacts} : {}) };
  let error = '';
  if (!textSources.length && !productFacts) error = '请先补充商品资料或核对 OCR 识别文字，再提炼卖点。';
  else if (productFacts.length > 20000) error = '商品资料超过 20000 字，请精简后重试。';
  else if (!salesSummaryInputSchema.safeParse(input).success) error = 'OCR 文字来源无效或过长，单条最多 40000 字、合计最多 60000 字，请核对或精简后重试。';
  return { input, inputKey: JSON.stringify({ rulesVersion: 5, input }), error, textCount: textSources.length };
}

/** Older confirmed copy remains bound to the OCR text used to create it. */
export function salesSummaryMatches(key: string, source: ReturnType<typeof salesSummarySource>): boolean {
  return key === source.inputKey || key === JSON.stringify({ rulesVersion: 4, input: {textSources: source.input.textSources} });
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
