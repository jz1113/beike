import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildReviewedWorkbook, parseKeywordWorkbookData } from './keywordReviewWorkbook';

function isolatedWorkbook() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['query'], ['猫砂']]), '关键词');
  const parsed = parseKeywordWorkbookData(book, '词包.xlsx');
  const records = parsed.records.map((record) => ({ ...record, status: 'error' as const,
    submissionUncertain: true, error: '提交结果待核对' }));
  return buildReviewedWorkbook(parsed, records);
}

describe('workbook progress reconciliation', () => {
  it('keeps a confirmed verdict added after exporting an uncertain receipt', () => {
    const book = isolatedWorkbook();
    Object.assign(book.Sheets['关键词'], {
      B2: { t: 's', v: '动物' }, C2: { t: 's', v: '宠物用品' },
      D2: { t: 's', v: '制作' }, E2: { t: 's', v: '' },
    });
    const restored = parseKeywordWorkbookData(book, '已核对.xlsx');
    expect(restored.records[0]).toMatchObject({ status: 'done', category: '动物', producible: '制作' });
    expect(restored.records[0].submissionUncertain).not.toBe(true);
  });

  it('continues to isolate an unresolved exact source row', () => {
    const restored = parseKeywordWorkbookData(isolatedWorkbook(), '进度.xlsx');
    expect(restored.records[0]).toMatchObject({ status: 'error', submissionUncertain: true });
  });

  it('does not quarantine an edited source query using an older receipt', () => {
    const book = isolatedWorkbook();
    book.Sheets['关键词'].A2 = { t: 's', v: '猫粮' };
    expect(parseKeywordWorkbookData(book, '修改.xlsx').records[0]).toMatchObject({ status: 'idle' });
  });
});
