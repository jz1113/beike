import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { importCoverSamples, releaseCoverSampleDrafts } from './coverSampleImport';

const decode = vi.fn(async () => ({ width: 720, height: 960 }));

function jpeg(name: string) {
  return new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43])], name, { type: 'image/jpeg' });
}

async function zipOf(entries: Record<string, Uint8Array | string>) {
  const zip = new JSZip();
  for (const [name, value] of Object.entries(entries)) zip.file(name, value);
  const blob = await zip.generateAsync({ type: 'arraybuffer' });
  return new File([blob], 'samples.zip', { type: 'application/zip' });
}

describe('cover sample import', () => {
  it('keeps one image and a picture inside a folder', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:cover', revokeObjectURL: () => {} });
    const packed = await zipOf({ 'folder/封面A.jpg': new Uint8Array(await jpeg('封面A.jpg').arrayBuffer()) });
    const result = await importCoverSamples([jpeg('封面B.jpg'), packed], decode);
    expect(result.error).toBeUndefined();
    expect(result.drafts.map((item) => item.name)).toEqual(['封面B.jpg', '封面A.jpg']);
    releaseCoverSampleDrafts(result.drafts);
  });

  it('rejects unsafe, nested, and oversized batches without dropping images silently', async () => {
    const unsafe = await zipOf({ '../secret.jpg': new Uint8Array(await jpeg('secret.jpg').arrayBuffer()) });
    await expect(importCoverSamples([unsafe], decode)).resolves.toMatchObject({ error: '压缩包包含不安全的路径' });
    const nested = await zipOf({ 'again.zip': new Uint8Array([1, 2, 3]) });
    await expect(importCoverSamples([nested], decode)).resolves.toMatchObject({ error: '压缩包里不能再包含压缩包' });
    const tooMany = Array.from({ length: 11 }, (_, index) => jpeg(`图${index}.jpg`));
    await expect(importCoverSamples(tooMany, decode)).resolves.toMatchObject({ error: '一次最多投喂 10 张封面，请减少后再投喂' });
  });

  it('skips a disguised image and reports the reason', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:cover', revokeObjectURL: () => {} });
    const fake = new File([Uint8Array.from([1, 2, 3, 4])], 'fake.jpg', { type: 'image/jpeg' });
    const result = await importCoverSamples([fake, jpeg('ok.jpg')], decode);
    expect(result.skipped.map((item) => item.reason)).toContain('文件内容不是受支持的图片');
    expect(result.drafts).toHaveLength(1);
  });
});
