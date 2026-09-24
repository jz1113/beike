import { KEYWORD_REVIEW_REJECT_PREFIXES } from '@beike/contracts/generate';

export const CATEGORY_REASON_MAX = 18;
export const REJECT_REASON_MAX = 24;
export const LOOKUP_SUBJECT_MAX = 12;

export function clipReasonChars(value: string, max: number): string {
  const chars = Array.from(value.trim());
  return chars.length <= max ? chars.join('') : chars.slice(0, max).join('');
}

export function normalizeCategoryReason(value: unknown): string {
  const text = clipReasonChars(String(value ?? '').replace(/\s+/g, ' '), CATEGORY_REASON_MAX);
  if (!text) throw new SyntaxError('模型未返回垂类依据');
  return text;
}

export function normalizeRejectReason(producible: '制作' | '不制作', value: unknown): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (producible === '制作') {
    return '';
  }
  const prefix = KEYWORD_REVIEW_REJECT_PREFIXES.find((item) => text.includes(item));
  if (!prefix) throw new SyntaxError('不制作依据缺少合法否决类型');
  const at = text.indexOf(prefix);
  const after = text.slice(at + prefix.length).replace(/^[：:\s，,。；;]+/, '');
  const before = text.slice(0, at).replace(/[：:\s，,。；;]+$/, '');
  const detail = clipReasonChars(after || before, REJECT_REASON_MAX - prefix.length - 1);
  if (!detail) throw new SyntaxError('不制作依据缺少命中点');
  return clipReasonChars(`${prefix}：${detail}`, REJECT_REASON_MAX);
}

export function rewriteLookupCategoryReason(
  previous: { category: string; categoryReason: string },
  nextCategory: string,
  subject?: string,
): string {
  if (nextCategory === previous.category) return previous.categoryReason;
  const entity = clipReasonChars((subject || '').replace(/[，,。；;：:、]/g, ''), LOOKUP_SUBJECT_MAX);
  return clipReasonChars(entity ? `${entity}，联网确认后归类` : '联网确认后归类', CATEGORY_REASON_MAX);
}
