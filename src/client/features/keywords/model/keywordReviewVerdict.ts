import { KEYWORD_REVIEW_CATEGORIES, KEYWORD_VIDEO_CATEGORIES, type KeywordReviewMode } from '@shared/contracts/generate';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';

/** Imported, recovered and newly returned results share the same verdict rules. */
export function isValidReviewVerdict(
  record: Pick<KeywordReviewRecord, 'category' | 'producible' | 'lowValue'>,
  mode: KeywordReviewMode = 'image',
): boolean {
  const categories: readonly string[] = mode === 'video' ? KEYWORD_VIDEO_CATEGORIES : KEYWORD_REVIEW_CATEGORIES;
  return categories.includes(record.category || '')
    && (record.producible === '制作' || record.producible === '不制作')
    && (mode !== 'video' || ((record.lowValue === '是' || record.lowValue === '否')
      && (record.lowValue !== '是' || record.producible === '不制作')));
}
