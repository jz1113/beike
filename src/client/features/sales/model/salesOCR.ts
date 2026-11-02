import { salesOCRResultSchema, type SalesOCRResult } from '@shared/contracts/sales';
import type { SalesImageRef } from '@shared/domain/sales';

export interface SalesOCRImage {
  imageUrl: string;
  editedText: string;
  confirmedText?: string;
  result?: SalesOCRResult;
  error?: string;
}
export interface SalesOCRState {
  step: 'images' | 'text';
  ocrImageUrls: string[];
  ocrImages: SalesOCRImage[];
}
export const emptySalesOCR = (): SalesOCRState => ({ step: 'images', ocrImageUrls: [], ocrImages: [] });

export function parseSalesOCR(saved: Record<string, unknown>, catalog: SalesImageRef[]): SalesOCRState {
  const available = new Set(catalog.map((image) => image.url));
  const ocrImageUrls = Array.isArray(saved.ocrImageUrls) ? [...new Set(saved.ocrImageUrls.filter((url): url is string => typeof url === 'string' && available.has(url)))] : [];
  const entries = new Map<string, SalesOCRImage>();
  if (Array.isArray(saved.ocrImages)) for (const entry of saved.ocrImages) {
    if (!entry || typeof entry !== 'object' || typeof entry.imageUrl !== 'string' || !available.has(entry.imageUrl)) continue;
    const result = salesOCRResultSchema.safeParse(entry.result);
    entries.set(entry.imageUrl, {
      imageUrl: entry.imageUrl, editedText: typeof entry.editedText === 'string' ? entry.editedText.slice(0, 100_000) : '',
      ...(typeof entry.confirmedText === 'string' ? { confirmedText: entry.confirmedText.slice(0, 100_000) } : {}),
      ...(result.success ? { result: result.data } : {}),
      ...(typeof entry.error === 'string' ? { error: entry.error.slice(0, 1000) } : {}),
    });
  }
  return { step: saved.step === 'text' ? 'text' : 'images', ocrImageUrls, ocrImages: [...entries.values()] };
}

export function patchOCRImage(entries: SalesOCRImage[], imageUrl: string, patch: Partial<SalesOCRImage>): SalesOCRImage[] {
  const previous = entries.find((entry) => entry.imageUrl === imageUrl) || { imageUrl, editedText: '' };
  const updated = { ...previous, ...patch, imageUrl };
  return entries.some((entry) => entry.imageUrl === imageUrl) ? entries.map((entry) => entry.imageUrl === imageUrl ? updated : entry) : [...entries, updated];
}

/** Confirmed source text stays separate from collected facts, so edits never overwrite them. */
export function confirmedOCRText(entries: SalesOCRImage[]): string {
  return uniqueOCRLines(entries.map((entry) => entry.confirmedText || '')).text;
}

function uniqueOCRLines(texts: string[]): { text: string; duplicateLines: number; lineCount: number } {
  const seen = new Set<string>();
  const lines: string[] = [];
  let duplicateLines = 0;
  for (const text of texts) for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !seen.has(line)) { seen.add(line); lines.push(line); }
    else if (line) duplicateLines += 1;
  }
  return { text: lines.join('\n'), duplicateLines, lineCount: lines.length };
}

/** Follow catalog order, use edited text, and retain different figures verbatim. */
export function summarizeSalesOCR(catalog: SalesImageRef[], imageUrls: string[], entries: SalesOCRImage[]) {
  const selected = new Set(imageUrls);
  const byURL = new Map(entries.map((entry) => [entry.imageUrl, entry]));
  const images = catalog.filter((image) => selected.has(image.url) && !image.unavailable).map((image) => byURL.get(image.url))
    .filter((entry): entry is SalesOCRImage => Boolean(entry?.result && !entry.error && entry.editedText.trim()));
  return { ...uniqueOCRLines(images.map((entry) => entry.editedText)), images };
}

export function confirmSalesOCRImages(entries: SalesOCRImage[], imageUrls: string[]): SalesOCRImage[] {
  const selected = new Set(imageUrls);
  return entries.map((entry) => selected.has(entry.imageUrl) && entry.result && !entry.error && entry.editedText.trim()
    ? { ...entry, confirmedText: entry.editedText.trim() } : entry);
}
