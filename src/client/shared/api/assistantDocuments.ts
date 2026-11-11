import { apiFetch } from './apiClient';

const DOC_EXT_RE = /\.(pdf|docx|pptx|xlsx|xls|md|txt|csv|json)$/i;
export const LEGACY_OFFICE_EXT_RE = /\.(doc|ppt)$/i;
const PLAIN_TEXT_EXT_RE = /\.(txt|md|csv|json)$/i;
const MAX_DOC_CHARS = 80000;
export const SUPPORTED_DOC_FORMATS = 'pdf、docx、pptx、xlsx、txt、md、csv、json';
export const FILE_ACCEPT =
  'image/*,video/*,.pdf,.docx,.pptx,.xlsx,.xls,.md,.txt,.csv,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,text/markdown,text/csv,application/json';

function truncateDocText(text: string): { text: string; truncated: boolean } {
  // eslint-disable-next-line no-control-regex
  const cleaned = (text || '').replace(/\u0000/g, '').trim();
  if (cleaned.length <= MAX_DOC_CHARS) return { text: cleaned, truncated: false };
  return {
    text: `【已截断：原文约 ${cleaned.length} 字，仅保留前 ${MAX_DOC_CHARS} 字】\n\n` + cleaned.slice(0, MAX_DOC_CHARS),
    truncated: true,
  };
}

export function isDocumentFile(file: File): boolean {
  if (DOC_EXT_RE.test(file.name)) return true;
  const t = (file.type || '').toLowerCase();
  return (
    t === 'application/pdf'
    || t.includes('wordprocessingml')
    || t.includes('presentationml')
    || t.includes('spreadsheetml')
    || t === 'application/vnd.ms-excel'
    || t === 'text/plain'
    || t === 'text/markdown'
    || t === 'text/csv'
    || t === 'application/json'
  );
}

/** Extract only supported document formats; callers retain the returned text with the conversation. */
export async function extractAssistantDocument(file: File, signal?: AbortSignal): Promise<{ text: string; truncated: boolean }> {
  if (LEGACY_OFFICE_EXT_RE.test(file.name)) throw new Error('请另存为 .docx / .pptx 后再上传');
  if (!isDocumentFile(file)) throw new Error(`暂不支持此格式。文档请用：${SUPPORTED_DOC_FORMATS}`);
  if (file.size > 15 * 1024 * 1024) throw new Error('文档不能超过 15 MB');
  let result: { text: string; truncated: boolean };
  if (PLAIN_TEXT_EXT_RE.test(file.name) || file.type.startsWith('text/') || file.type === 'application/json') {
    result = truncateDocText(await file.text());
  } else {
    const form = new FormData();
    form.append('file', file);
    const response = await apiFetch('/api/assistant/extract-document', { method: 'POST', body: form, signal });
    const data = await response.json();
    if (!response.ok || !data.success || typeof data.text !== 'string') throw new Error(data.error || '文档解析失败');
    const normalized = truncateDocText(data.text);
    result = { text: normalized.text, truncated: Boolean(data.truncated) || normalized.truncated };
  }
  if (!result.text.trim()) throw new Error('未能提取到可读文本，请使用含文字的文档');
  return result;
}
