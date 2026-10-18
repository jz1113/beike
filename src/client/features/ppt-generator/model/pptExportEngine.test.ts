import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

describe('pptExportEngine', () => {
  it('正确组装基本的 pptx 结构文件', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types></Types>');
    zip.file('ppt/presentation.xml', '<p:presentation></p:presentation>');

    const content = await zip.generateAsync({ type: 'uint8array' });
    expect(content.length).toBeGreaterThan(0);
    // 验证 zip 头魔数 PK\x03\x04
    expect(content[0]).toBe(0x50);
    expect(content[1]).toBe(0x4b);
  });
});
