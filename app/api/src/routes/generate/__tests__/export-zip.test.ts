import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  buildCopywritingTxtContent,
  buildProductFolderName,
  sanitizeFileSystemName,
  POST,
} from '../export-zip';
import { parseExportZipBody } from '../../../core/validate';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('export-zip helpers', () => {
  it('sanitizeFileSystemName strips illegal characters', () => {
    expect(sanitizeFileSystemName('foo/bar:baz')).toBe('foo_bar_baz');
  });

  it('buildProductFolderName joins id and title', () => {
    expect(buildProductFolderName('SKU1', '测试标题')).toBe('SKU1-测试标题');
  });

  it('buildCopywritingTxtContent formats xhs copy', () => {
    const txt = buildCopywritingTxtContent('标题', '正文', ['标签']);
    expect(txt).toContain('标题');
    expect(txt).toContain('#标签');
  });

  it('parseExportZipBody accepts downloadConcurrency', () => {
    const parsed = parseExportZipBody({ downloadConcurrency: 12, images: [TINY_PNG] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.downloadConcurrency).toBe(12);
    }
  });
});

describe('export-zip POST', () => {
  it('builds multi-product ZIP with global pool using data URLs', async () => {
    const products = Array.from({ length: 3 }, (_, i) => ({
      skuId: `P${i + 1}`,
      title: `商品${i + 1}`,
      images: [TINY_PNG, TINY_PNG],
    }));

    const res = await POST(
      new Request('http://localhost/api/generate/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchTitle: '测试批次',
          downloadConcurrency: 8,
          products,
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');

    const buf = Buffer.from(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files);
    expect(names.some((n) => n.includes('shot_01'))).toBe(true);
    expect(names.some((n) => n.includes('商品1'))).toBe(true);
  });
});
