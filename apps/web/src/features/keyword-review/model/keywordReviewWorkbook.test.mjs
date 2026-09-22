import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import {
  allocateReviewColumns,
  buildOutputColumns,
  buildReviewedWorkbook,
  fieldKind,
  parseKeywordWorkbookData,
  splitRejectReason,
} from './keywordReviewWorkbook.ts';

const SOURCE_HEADERS = ['序号', 'query', '相关拓展', '笔记内容', '实体拓展q', '分类', '需上传数', '已上传数', '下发时间'];

test('allocateReviewColumns expands an old adjacent pair in place', () => {
  const cols = allocateReviewColumns({ category: 5, producible: 6 }, 6);
  assert.deepEqual(cols, {
    categoryCol: 5,
    categoryReasonCol: 6,
    producibleCol: 7,
    rejectReasonCol: 8,
    producibleReadCol: 6,
  });
});

test('allocateReviewColumns reuses a complete four-column block', () => {
  const cols = allocateReviewColumns({
    category: 4,
    categoryReason: 5,
    producible: 6,
    rejectReason: 7,
  }, 7);
  assert.equal(cols.categoryReasonReadCol, 5);
  assert.equal(cols.producibleReadCol, 6);
  assert.equal(cols.rejectReasonReadCol, 7);
});

test('allocateReviewColumns appends missing reason columns at the end', () => {
  const cols = allocateReviewColumns({ category: 3, producible: 8 }, 10);
  assert.equal(cols.categoryCol, 3);
  assert.equal(cols.producibleCol, 8);
  assert.equal(cols.categoryReasonCol, 11);
  assert.equal(cols.rejectReasonCol, 12);
  assert.equal(cols.producibleReadCol, 8);
});

test('allocateReviewColumns inserts new review columns after 下发时间', () => {
  const cols = allocateReviewColumns({}, 8, 8);
  assert.deepEqual(cols, {
    categoryCol: 9,
    categoryReasonCol: 10,
    producibleCol: 11,
    rejectReasonCol: 12,
    categoryReasonReadCol: undefined,
    producibleReadCol: 11,
    rejectReasonReadCol: undefined,
  });
});

test('splitRejectReason shows the veto type and the hit separately', () => {
  assert.equal(splitRejectReason(''), null);
  assert.deepEqual(splitRejectReason('简单问答：只确认一个身份'), { kind: '简单问答', detail: '只确认一个身份' });
  assert.deepEqual(splitRejectReason('非笔记需求: 平台绑卡操作'), { kind: '非笔记需求', detail: '平台绑卡操作' });
  assert.deepEqual(splitRejectReason('没有前缀的旧说明'), { kind: '', detail: '没有前缀的旧说明' });
});

test('recognizes 相关拓展 and 笔记内容 aliases', () => {
  assert.equal(fieldKind('相关拓展'), 'expansion');
  assert.equal(fieldKind('相关拓展q'), 'expansion');
  assert.equal(fieldKind('笔记内容'), 'contentType');
  assert.equal(fieldKind('笔记内容类型'), 'contentType');
  assert.equal(fieldKind('分类'), 'sourceCategory');
  assert.equal(fieldKind('最终垂类'), 'category');
  assert.equal(fieldKind('下发时间'), 'dispatchTime');
});

test('buildOutputColumns drops empty entity expansion and category after 下发时间', () => {
  const headers = SOURCE_HEADERS.map((label, col) => ({ col, label }));
  const cols = buildOutputColumns(headers, [4, 5]);
  assert.deepEqual(cols.map((column) => column.label), [
    '序号', 'query', '相关拓展', '笔记内容', '需上传数', '已上传数', '下发时间',
    '最终垂类', '垂类依据', '是否可制作', '不制作依据',
  ]);
  assert.equal(cols.find((column) => column.key === 'dispatchTime' )?.kind, 'source');
  const dispatchIndex = cols.findIndex((column) => column.key === 'dispatchTime');
  assert.equal(cols[dispatchIndex + 1].kind, 'category');
});

test('buildOutputColumns keeps entity expansion and category when they have values', () => {
  const headers = SOURCE_HEADERS.map((label, col) => ({ col, label }));
  const cols = buildOutputColumns(headers, []);
  assert.equal(cols.some((column) => column.label === '实体拓展q'), true);
  assert.equal(cols.some((column) => column.label === '分类'), true);
  const dispatchIndex = cols.findIndex((column) => column.key === 'dispatchTime');
  assert.equal(cols[dispatchIndex + 1].kind, 'category');
});

test('buildOutputColumns appends review columns at the end when there is no 下发时间', () => {
  const cols = buildOutputColumns([
    { col: 0, label: 'query' },
    { col: 1, label: '相关拓展' },
  ], []);
  assert.deepEqual(cols.map((column) => column.kind).slice(-4), ['category', 'categoryReason', 'producible', 'rejectReason']);
  assert.deepEqual(cols.map((column) => column.label), ['query', '相关拓展', '最终垂类', '垂类依据', '是否可制作', '不制作依据']);
});

function cell(sheet, row, col) {
  const value = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
  return value ? String(value.w ?? value.v) : '';
}

test('parse and export follow original headers without empty 实体拓展q or 分类', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    SOURCE_HEADERS,
    [1, '游戏手机推荐', '手机评测 游戏性能', '评测', '', '', 3, 1, '2026-09-01'],
    [2, '美国总统是谁', '美国现任总统', '问答', '', '', 2, 0, '2026-09-02'],
  ]);
  const parsed = parseKeywordWorkbookData({
    SheetNames: ['词包'],
    Sheets: { 词包: sheet },
  }, '词包.xlsx');

  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].expansion, '手机评测 游戏性能');
  assert.equal(parsed.records[0].contentType, '评测');
  assert.equal(parsed.records[0].entityExpansion, undefined);
  assert.equal(parsed.records[0].sourceValues['source:序号'], '1');
  assert.deepEqual(parsed.displayColumns.map((column) => column.label), [
    '序号', 'query', '相关拓展', '笔记内容', '需上传数', '已上传数', '下发时间',
    '最终垂类', '垂类依据', '是否可制作', '不制作依据',
  ]);

  parsed.records[0] = {
    ...parsed.records[0],
    status: 'done',
    category: '3C数码',
    categoryReason: '被选的是手机，不是游戏内容',
    producible: '制作',
    rejectReason: '',
  };
  parsed.records[1] = {
    ...parsed.records[1],
    status: 'done',
    category: '社会',
    categoryReason: '问的是国家元首身份',
    producible: '不制作',
    rejectReason: '简单问答：只确认一个身份',
  };

  const exported = buildReviewedWorkbook(parsed, parsed.records).Sheets['词包'];
  const headers = Array.from({ length: 11 }, (_, col) => cell(exported, 0, col));
  assert.deepEqual(headers, [
    '序号', 'query', '相关拓展', '笔记内容', '需上传数', '已上传数', '下发时间',
    '最终垂类', '垂类依据', '是否可制作', '不制作依据',
  ]);
  assert.equal(cell(exported, 0, 11), '');
  assert.equal(cell(exported, 1, 1), '游戏手机推荐');
  assert.equal(cell(exported, 1, 6), '2026-09-01');
  assert.equal(cell(exported, 1, 7), '3C数码');
  assert.equal(cell(exported, 1, 9), '制作');
  assert.equal(cell(exported, 2, 9), '不制作');
  assert.equal(cell(exported, 2, 10), '简单问答：只确认一个身份');
});

test('parse keeps 实体拓展q and 分类 when they have values', () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    SOURCE_HEADERS,
    [1, '猫砂', '除臭 膨润土', '种草', '宠物用品', '家居', 1, 0, '2026-09-01'],
  ]);
  const parsed = parseKeywordWorkbookData({
    SheetNames: ['词包'],
    Sheets: { 词包: sheet },
  }, '词包.xlsx');
  assert.equal(parsed.records[0].entityExpansion, '宠物用品');
  assert.equal(parsed.records[0].sourceValues.sourceCategory, '家居');
  assert.equal(parsed.displayColumns.some((column) => column.label === '实体拓展q'), true);
  assert.equal(parsed.displayColumns.some((column) => column.label === '分类'), true);
  const dispatchIndex = parsed.displayColumns.findIndex((column) => column.key === 'dispatchTime');
  assert.equal(parsed.displayColumns[dispatchIndex + 1].label, '最终垂类');
});
