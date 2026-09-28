import snapshot from './comflyPriceSnapshot.json';
import type { ComflyPriceMap } from './multimodalPriceSort';

export type Quotation = { group: string; detail: string; page: number };
export const COMFLY_QUOTATION_DATE = '2026-09-23';
export function comflyQuotations(id: string): Quotation[] {
  return (snapshot as Record<string, Quotation[]>)[id.toLowerCase()] ?? [];
}
export function comflyTokenPrice(id: string, live?: ComflyPriceMap | null) {
  const current = live?.[id.toLowerCase()];
  if (current && Number.isFinite(current.promptPer1k) && Number.isFinite(current.completionPer1k)) return current;
  const detail = comflyQuotations(id).find(row => row.group === '默认分组')?.detail ?? '';
  const input = detail.match(/提示[:：]\s*฿\s*([\d.]+)\/K\s*token/);
  const output = detail.match(/补全[:：]\s*฿\s*([\d.]+)\/K\s*token/);
  return input && output ? { promptPer1k: Number(input[1]), completionPer1k: Number(output[1]) } : undefined;
}
export function quotationSummary(quote: Quotation): string {
  const fixed = quote.detail.match(/固定价格[:：]\s*(.+)/);
  if (fixed) return fixed[1];
  const tokens = quote.detail.split('\n').filter(line => /^(提示|补全)[:：]/.test(line));
  return tokens.length ? tokens.join(' · ') : '按规格计费';
}
