import { beforeEach, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { exportBatchZip, exportSingleProductZip } from '../batchRunnerExport';
import type { BatchProductItem } from '../batchTypes';
const mocks = vi.hoisted(() => ({ save: vi.fn(async () => 'desktop'), native: vi.fn(async () => {}), api: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/downloadMedia', () => ({ fetchMediaBlob: mocks.fetch, downloadMediaOrOpen: vi.fn() }));
vi.mock('@/lib/desktopDownload', () => ({ saveToDownloadDir: mocks.save }));
vi.mock('@/lib/exportZipDownload', () => ({ exportZipDownload: mocks.native, formatExportProgress: () => '正在保存' }));
vi.mock('@/lib/desktopRuntime', () => ({ getApiBase: () => 'http://127.0.0.1:3000' }));
beforeEach(() => vi.clearAllMocks());
vi.mock('@/lib/apiClient', () => ({ apiFetch: mocks.api }));
it('saves local images and offline manifest without uploading or changing live task URLs', async () => {
  mocks.fetch.mockResolvedValue(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
  const item = { id: 'a', itemId: '123', title: '手机', copywriting: { title: '标题', content: '正文', tags: [] }, tasks: [
    { id: '1', shot_no: 1, title: '正面', status: 'SUCCESS', resultUrl: '/storage/local.png' },
    { id: '2', shot_no: 2, title: '侧面', status: 'FAILURE' },
    { id: '3', shot_no: 3, title: '背面', status: 'SUCCESS', resultUrl: 'blob:local' },
  ] } as BatchProductItem;
  const toast = vi.fn();
  await exportBatchZip([item], { showToast: toast, setToastMsg: vi.fn(), setIsExportingZip: vi.fn(), setExportingSingleItemId: vi.fn() });
  expect(mocks.api).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledOnce();
  const blob = (mocks.save.mock.calls[0] as unknown as [string, Blob])[1];
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const imagePaths = Object.keys(zip.files).filter(path => path.endsWith('.png'));
  expect(imagePaths).toHaveLength(2);
  const sheet = await zip.file('00_贝壳云图_矩阵生产清单.xlsx')!.async('uint8array');
  const workbook = XLSX.read(sheet);
  const row = XLSX.utils.sheet_to_json<Record<string,string>>(workbook.Sheets[workbook.SheetNames[0]])[0];
  expect(imagePaths).toContain(row['图链接1']);
  expect(row['图链接2']).toBe('');
  expect(imagePaths).toContain(row['图链接3']);
  expect(item.tasks[0].resultUrl).toBe('/storage/local.png');
});

it('routes persisted workshop images directly to native export without reading blobs', async () => {
  const item = { id: 'local', itemId: '123', title: '手机', tasks: [
    { id: '1', shot_no: 1, title: '正面', status: 'SUCCESS', resultUrl: '/storage/local.png' },
    { id: '2', shot_no: 3, title: '侧面', status: 'SUCCESS', resultUrl: 'http://127.0.0.1:3000/storage/side.png' },
  ] } as BatchProductItem;
  const deps = { showToast: vi.fn(), setToastMsg: vi.fn(), setIsExportingZip: vi.fn(), setExportingSingleItemId: vi.fn() };
  await exportBatchZip([item], deps);
  await exportSingleProductZip(item, deps);
  expect(mocks.native).toHaveBeenCalledTimes(2);
  const payload = (mocks.native.mock.calls[0] as unknown as [any])[0];
  expect(payload.offlineMatrix).toBe(true);
  expect(payload.products[0].images[1]).toMatchObject({ url: '/storage/side.png', shotNo: 3 });
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(deps.setIsExportingZip).toHaveBeenLastCalledWith(false);
});

it('gracefully falls back to client-side zip if native direct export fails', async () => {
  mocks.native.mockRejectedValueOnce(new Error('磁盘只读或目录不可用'));
  mocks.fetch.mockResolvedValue(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
  const item = { id: 'local-fallback', itemId: '456', title: '电脑', tasks: [
    { id: '1', shot_no: 1, title: '正面', status: 'SUCCESS', resultUrl: '/storage/local.png' },
  ] } as BatchProductItem;
  const toast = vi.fn();
  await exportBatchZip([item], { showToast: toast, setToastMsg: vi.fn(), setIsExportingZip: vi.fn(), setExportingSingleItemId: vi.fn() });
  expect(mocks.native).toHaveBeenCalledOnce();
  expect(mocks.fetch).toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledOnce();
});
