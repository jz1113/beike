import { KEYWORD_REVIEW_REJECT_PREFIXES } from '@beike/contracts/generate';

export const CATEGORY_REASON_MAX = 28;
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
    if (text) throw new SyntaxError('可制作行不应返回不制作依据');
    return '';
  }
  const prefix = KEYWORD_REVIEW_REJECT_PREFIXES.find((item) => text.startsWith(`${item}：`) || text.startsWith(`${item}:`));
  if (!prefix) throw new SyntaxError('不制作依据缺少合法否决类型');
  const detail = clipReasonChars(text.slice(prefix.length).replace(/^[：:]\s*/, ''), REJECT_REASON_MAX - prefix.length - 1);
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
