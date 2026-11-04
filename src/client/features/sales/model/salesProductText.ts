import type { SalesCollectionState } from './salesCollectionDraft';

type ProductTextSource = Pick<SalesCollectionState, 'sellingPoints' | 'imageCatalog' | 'ocrImageUrls' | 'ocrImages'>;

export function salesProductTextParts(state: ProductTextSource) {
  const parts = [{ url: '', text: state.sellingPoints }];
  let hasText = Boolean(state.sellingPoints);
  for (const image of state.imageCatalog) {
    if (!state.ocrImageUrls.includes(image.url)) continue;
    const entry = state.ocrImages.find((item) => item.imageUrl === image.url);
    if (!entry || (!entry.editedText && !entry.documentBreak)) continue;
    const separator = entry.documentBreak ?? (hasText ? '\n\n' : '');
    parts.push({ url: image.url, text: separator + entry.editedText });
    hasText = true;
  }
  return parts;
}

/** Apply the textarea's replacement to the affected sources, keeping the other images independent. */
export function editSalesProductText(state: ProductTextSource, next: string, caret: number) {
  const parts = salesProductTextParts(state);
  const previous = parts.map((part) => part.text).join('');
  let end = previous.length;
  let nextEnd = next.length;
  while (nextEnd > caret && end > 0 && previous[end - 1] === next[nextEnd - 1]) { end--; nextEnd--; }
  let start = 0;
  while (start < end && start < nextEnd && previous[start] === next[start]) start++;

  let offset = 0;
  let inserted = false;
  let sellingPoints = state.sellingPoints;
  let hasText = false;
  const edits = new Map<string, { documentBreak?: string; editedText: string }>();
  for (const part of parts) {
    const limit = offset + part.text.length;
    const before = part.text.slice(0, Math.max(0, start - offset));
    const after = part.text.slice(Math.max(0, end - offset));
    const receivesEdit = !inserted && (start < limit || (start === limit && end === start)) && (part.text.length > 0 || parts.length === 1);
    const text = before + (receivesEdit ? next.slice(start, nextEnd) : '') + after;
    if (receivesEdit) inserted = true;
    if (!part.url) sellingPoints = text;
    else {
      // Preserve the displayed boundary even when a preceding source is cleared.
      const documentBreak = text.match(/^\n{0,2}/)![0];
      const defaultBreak = hasText ? '\n\n' : '';
      const editedText = text.slice(documentBreak.length);
      edits.set(part.url, { documentBreak: documentBreak === defaultBreak && editedText ? undefined : documentBreak, editedText });
    }
    hasText ||= Boolean(text);
    offset = limit;
  }
  return { sellingPoints, ocrImages: state.ocrImages.map((entry) => edits.has(entry.imageUrl) ? { ...entry, ...edits.get(entry.imageUrl) } : entry) };
}
