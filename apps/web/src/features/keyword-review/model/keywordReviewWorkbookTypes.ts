import type * as XLSX from 'xlsx';
import type { KeywordReviewMode, KeywordReviewRow } from '@beike/contracts/generate';

export type KeywordReviewStatus = 'idle' | 'running' | 'done' | 'error';

export type FieldKind =
  | 'query'
  | 'expansion'
  | 'entityExpansion'
  | 'contentType'
  | 'sourceCategory'
  | 'dispatchTime'
  | 'category'
  | 'categoryReason'
  | 'producible'
  | 'rejectReason'
  | 'lowValue';

export type OutputColumnKind = 'source' | 'category' | 'categoryReason' | 'producible' | 'rejectReason' | 'lowValue';

export interface OutputColumn {
  key: string;
  label: string;
  kind: OutputColumnKind;
  sourceKind?: FieldKind;
  sourceCol?: number;
}

export interface KeywordReviewRecord extends KeywordReviewRow {
  sheetName: string;
  rowNumber: number;
  status: KeywordReviewStatus;
  category?: string;
  producible?: '制作' | '不制作';
  categoryReason?: string;
  rejectReason?: string;
  lowValue?: '是' | '否';
  error?: string;
  submissionUncertain?: boolean;
  sourceValues: Record<string, string>;
}

export interface KeywordReviewSheet {
  name: string;
  headerRow: number;
  range: XLSX.Range;
  outputColumns: OutputColumn[];
  recordCount: number;
}

export interface ParsedKeywordWorkbook {
  workbook: XLSX.WorkBook;
  fileName: string;
  mode: KeywordReviewMode;
  records: KeywordReviewRecord[];
  sheets: KeywordReviewSheet[];
  displayColumns: OutputColumn[];
}

export interface ReviewColumns {
  categoryCol: number;
  categoryReasonCol: number;
  producibleCol: number;
  rejectReasonCol: number;
  categoryReasonReadCol?: number;
  producibleReadCol: number;
  rejectReasonReadCol?: number;
  lowValueCol?: number;
  lowValueReadCol?: number;
}

export const REVIEW_OUTPUT_COLUMNS: OutputColumn[] = [
  { key: 'category', label: '最终垂类', kind: 'category' },
  { key: 'categoryReason', label: '垂类依据', kind: 'categoryReason' },
  { key: 'producible', label: '是否可制作', kind: 'producible' },
  { key: 'rejectReason', label: '不制作依据', kind: 'rejectReason' },
];

export const VIDEO_REVIEW_OUTPUT_COLUMNS: OutputColumn[] = [
  ...REVIEW_OUTPUT_COLUMNS,
  { key: 'lowValue', label: '低价值关键词', kind: 'lowValue' },
];
