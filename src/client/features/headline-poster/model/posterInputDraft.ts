export interface PosterInputDraft {
  pasteText: string;
  importMode: 'file' | 'paste';
}

const EMPTY_DRAFT: PosterInputDraft = { pasteText: '', importMode: 'paste' };

function draftKey(scope: string): string {
  if (!/^[a-f0-9]{64}$/.test(scope)) throw new Error('大字报工作区标识无效');
  return `headline_poster_input_draft_v1:${scope}`;
}

/** Input drafts belong to this browser tab and never replace saved batches. */
export function loadPosterInputDraft(scope: string): PosterInputDraft {
  const raw = window.sessionStorage.getItem(draftKey(scope));
  if (!raw) return { ...EMPTY_DRAFT };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('输入草稿格式无效');
  const draft = value as Partial<PosterInputDraft>;
  if (typeof draft.pasteText !== 'string' || (draft.importMode !== 'file' && draft.importMode !== 'paste')) {
    throw new Error('输入草稿格式无效');
  }
  return { pasteText: draft.pasteText, importMode: draft.importMode };
}

export function persistPosterInputDraft(scope: string, draft: PosterInputDraft): void {
  window.sessionStorage.setItem(draftKey(scope), JSON.stringify(draft));
}
