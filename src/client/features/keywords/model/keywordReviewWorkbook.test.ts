import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { buildMergedReviewedWorkbook, buildReviewedWorkbook, exportReviewedWorkbook, parseKeywordWorkbookData } from './keywordReviewWorkbook';
import { isValidReviewVerdict } from './keywordReviewVerdict';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';

vi.mock('@client/shared/media/saveDownload', () => ({ saveToDownloadDir: vi.fn(async () => 'browser') }));

function workbook(rows: unknown[][]): XLSX.WorkBook {
  const value = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(value, XLSX.utils.aoa_to_sheet(rows), '关键词');
  return value;
}

function completed(records: KeywordReviewRecord[]): KeywordReviewRecord[] {
  return records.map((record) => ({ ...record, status: 'done', category: '其他',
    categoryReason: '按内容归类', producible: '制作', rejectReason: '' }));
}

async function downloadedWorkbook(): Promise<XLSX.WorkBook> {
  const [, data] = vi.mocked(saveToDownloadDir).mock.calls[0];
  expect(data).toBeInstanceOf(Blob);
  return XLSX.read(await (data as Blob).arrayBuffer(), { type: 'array' });
}

beforeEach(() => vi.clearAllMocks());

describe('keyword workbook data preservation', () => {
  it.each([false, true])('keeps notes and title rows in exported files (partial=%s)', async (partial) => {
    const source = workbook([
      ['词包说明：保留所有原始数据'],
      ['query', '备注'],
      ['苹果', '第一条'],
      ['', '中间备注不能丢'],
      ['猫砂', '第二条'],
      ['', '末尾备注不能丢'],
    ]);
    const parsed = parseKeywordWorkbookData(source, '原始词包.xlsx');
    expect(parsed.preserveSourceLayout).toBe(true);
    await exportReviewedWorkbook(parsed, completed(parsed.records), partial);
    const exported = await downloadedWorkbook();
    const sheet = exported.Sheets['关键词'];
    expect(sheet.A1.v).toBe('词包说明：保留所有原始数据');
    expect(sheet.B4.v).toBe('中间备注不能丢');
    expect(sheet.B6.v).toBe('末尾备注不能丢');
    expect(sheet.A3.v).toBe('苹果');
    expect(sheet.A5.v).toBe('猫砂');
    expect(parseKeywordWorkbookData(exported, '审核表.xlsx').records.every((record) => record.status === 'done')).toBe(true);
    expect(source.Sheets['关键词'].C3).toBeUndefined();
  });

  it('preserves notes from an older recovery snapshot without a layout flag', () => {
    const parsed = parseKeywordWorkbookData(workbook([['query', '备注'], ['苹果', '正常行'], ['', '原始备注']]), '恢复.xlsx');
    parsed.preserveSourceLayout = false;
    const exported = buildMergedReviewedWorkbook(parsed, completed(parsed.records));
    expect(exported.Sheets['关键词'].B3.v).toBe('原始备注');
    expect(exported.Sheets['关键词'].A2.v).toBe('苹果');
  });

  it('preserves earlier sheet layouts when a later sheet contains a note', () => {
    const source = workbook([['query', '实体拓展q', '备注'], ['苹果', '', '第一张表']]);
    XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([
      ['query', '备注'], ['猫砂', '第二张表'], ['', '第二张表说明'],
    ]), '第二张表');
    const parsed = parseKeywordWorkbookData(source, '多表.xlsx');
    const exported = buildMergedReviewedWorkbook(parsed, completed(parsed.records));
    expect(exported.SheetNames.slice(0, 2)).toEqual(['关键词', '第二张表']);
    expect(exported.Sheets['关键词'].C2.v).toBe('第一张表');
    expect(exported.Sheets['关键词'].B1.v).toBe('实体拓展q');
    expect(exported.Sheets['第二张表'].B3.v).toBe('第二张表说明');
  });

  it('still merges plain keyword sheets without notes', () => {
    const source = workbook([['query'], ['苹果']]);
    XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([['query'], ['猫砂']]), '第二张表');
    const parsed = parseKeywordWorkbookData(source, '多表.xlsx');
    expect(parsed.preserveSourceLayout).toBe(false);
    const exported = buildMergedReviewedWorkbook(parsed, completed(parsed.records));
    expect(exported.SheetNames[0]).toBe('审核结果');
    expect(parseKeywordWorkbookData(exported, '完成.xlsx').records.map((record) => record.query)).toEqual(['苹果', '猫砂']);
  });
});

describe('video workbook verdicts', () => {
  const headers = ['query', '最终垂类', '垂类依据', '是否可制作', '不制作依据', '低价值关键词'];

  it('returns contradictory imported verdicts to pending and clears them on export', async () => {
    const source = workbook([headers, ['苹果', '美食', '食品内容', '制作', '', '是']]);
    const parsed = parseKeywordWorkbookData(source, '视频.xlsx', 'video');
    expect(parsed.records[0]).toMatchObject({ status: 'idle', category: undefined, producible: undefined, lowValue: undefined });
    await exportReviewedWorkbook(parsed, parsed.records, true);
    const exported = await downloadedWorkbook();
    const restored = parseKeywordWorkbookData(exported, '进度.xlsx', 'video');
    expect(restored.records[0].status).toBe('idle');
    expect(XLSX.utils.sheet_to_json(exported.Sheets['关键词'], { header: 1 })[1]).toEqual(['苹果', '', '', '', '', '']);
    expect(source.Sheets['关键词'].D2.v).toBe('制作');
  });

  it.each([
    ['制作', '否', ''],
    ['不制作', '否', '限制过细：缺少通用价值'],
    ['不制作', '是', '无优质参考源：内容价值不足'],
  ] as const)('keeps valid imported verdicts: %s / lowValue=%s', (producible, lowValue, rejectReason) => {
    const parsed = parseKeywordWorkbookData(workbook([headers, ['苹果', '美食', '食品内容', producible, rejectReason, lowValue]]), '视频.xlsx', 'video');
    expect(parsed.records[0].status).toBe('done');
    expect(isValidReviewVerdict(parsed.records[0], 'video')).toBe(true);
    const restored = parseKeywordWorkbookData(buildReviewedWorkbook(parsed, parsed.records), '导出.xlsx', 'video');
    expect(restored.records[0]).toMatchObject({ status: 'done', producible, lowValue });
  });

  it('rejects contradictory saved verdicts under the same rule used by session recovery', () => {
    expect(isValidReviewVerdict({ category: '美食', producible: '制作', lowValue: '是' }, 'video')).toBe(false);
    expect(isValidReviewVerdict({ category: '美食', producible: '制作' }, 'video')).toBe(false);
  });
});
