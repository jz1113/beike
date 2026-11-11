import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './apiClient';
import { extractAssistantDocument } from './assistantDocuments';

vi.mock('./apiClient', () => ({ apiFetch: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('assistant document extraction', () => {
  it('retains text beyond the former 8000-character preview limit', async () => {
    const text = '文'.repeat(12000);
    expect(await extractAssistantDocument(new File([text], 'brief.txt'))).toEqual({ text, truncated: false });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('sends document bytes to the existing parser and keeps its extracted body', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ success: true, text: 'PDF 正文'.repeat(3000), truncated: false })));
    const file = new File(['pdf-body'], 'brief.pdf', { type: 'application/pdf' });
    const result = await extractAssistantDocument(file);
    const [path, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(path).toBe('/api/assistant/extract-document');
    expect((init?.body as FormData).get('file')).toBe(file);
    expect(result.text).toHaveLength(18000);
  });

  it('reports parser errors, empty scans, legacy formats and oversized text', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'PDF 格式无效' }), { status: 400 }));
    await expect(extractAssistantDocument(new File(['x'], 'bad.pdf'))).rejects.toThrow('PDF 格式无效');
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({ success: true, text: ' ' })));
    await expect(extractAssistantDocument(new File(['x'], 'scan.pdf'))).rejects.toThrow('未能提取');
    await expect(extractAssistantDocument(new File(['x'], 'old.doc'))).rejects.toThrow('docx');
    await expect(extractAssistantDocument(new File(['x'.repeat(15 * 1024 * 1024 + 1)], 'large.txt'))).rejects.toThrow('15 MB');
  });
});
