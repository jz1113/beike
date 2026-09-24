import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

test('workshop ZIP contains persisted images and copywriting, and rejects missing images', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'beike-workshop-export-'));
  const priorDataDir = process.env.AZHUO_DATA_DIR;
  process.env.AZHUO_DATA_DIR = dataDir;
  try {
    const imagePath = path.join(dataDir, 'storage', 'workspace', 'shot.png');
    await fs.mkdir(path.dirname(imagePath), { recursive: true });
    await fs.writeFile(imagePath, Buffer.from('89504e470d0a1a0a', 'hex'));
    const { POST } = await import('./exportZip.ts');
    const payload = {
      offlineMatrix: true,
      batchTitle: '测试批次',
      products: [{
        currentName: '商品1', title: '测试商品',
        copywritingTitle: '笔记标题', copywritingContent: '笔记正文',
        images: [{ url: '/storage/workspace/shot.png', filename: '分镜1.png' }],
      }],
    };
    const response = await POST(new Request('http://localhost/api/generate/export-zip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Export-Completed'), '1');
    assert.equal(response.headers.get('X-Export-Total'), '1');
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    assert.ok(zip.file('测试批次/商品1/分镜1.png'));
    assert.match(await zip.file('测试批次/商品1/小红书种草文案.txt').async('string'), /笔记正文/);

    payload.products[0].images.push({ url: '/storage/workspace/shot.png', filename: '分镜2.png' });
    const repeatedResponse = await POST(new Request('http://localhost/api/generate/export-zip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }));
    const repeatedZip = await JSZip.loadAsync(await repeatedResponse.arrayBuffer());
    assert.ok(repeatedZip.file('测试批次/商品1/分镜1.png'));
    assert.ok(repeatedZip.file('测试批次/商品1/分镜2.png'));

    payload.products[0].images[0].url = '/storage/workspace/missing.png';
    payload.products[0].images[1].url = '/storage/workspace/missing.png';
    const missingResponse = await POST(new Request('http://localhost/api/generate/export-zip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }));
    assert.equal(missingResponse.status, 404);
  } finally {
    if (priorDataDir === undefined) delete process.env.AZHUO_DATA_DIR;
    else process.env.AZHUO_DATA_DIR = priorDataDir;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
