import type JSZip from 'jszip';
import type { ExportZipResult } from '@client/shared/api/exportZipDownload';
import { fetchMediaBlob } from '@client/shared/media/downloadMedia';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { formatWorkshopCopywriting, uniqueWorkshopFolderName, workshopProductFolderName } from '@shared/domain/workshop/workshopExport';
import type { BatchProductItem } from '../batchTypes';
import { isDeliverableWorkshopResult } from '../generation/workshopReadiness';
import { blobExtFromMime } from '../collection/batchRunnerIo';
import { buildMatrixExportRows } from './batchMatrixExport';
import { canNativeOfflineExport, tryNativeOfflineZip } from './batchZipNative';
import { exportFourShots, exportGeneratedTitle, exportProductId, exportPromptGroupName } from './batchExportFields';

export type { MatrixExportRow } from './batchMatrixExport';
export { buildMatrixExportRows, ensurePermanentImageUrl } from './batchMatrixExport';

export interface BatchExportDeps {
  setIsExportingZip: (v: boolean) => void;
  setExportingSingleItemId: (id: string | null) => void;
  setToastMsg: (msg: string | null) => void;
  showToast: (msg: string) => void;
}

function productsWithTasks(items: BatchProductItem[]) {
  return items.filter(item => item.selected && (item.tasks || []).some(task => task.resultStatus !== 'superseded' && (isDeliverableWorkshopResult(task) || task.status === 'FAILURE')));
}

function zipFileName(prefix: string) {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.zip`;
}

function zipResultMessage(result: ExportZipResult, title = '图片包') {
  const delivery = `已发起${title}下载`;
  return result.partial
    ? `${delivery}；图片 ${result.succeeded} 成功 / ${result.failed} 失败，失败说明已写入 ZIP`
    : `${delivery}（图片 ${result.succeeded} 成功）`;
}

async function fetchGeneratedImage(url: string): Promise<Blob> {
  const blob = await fetchMediaBlob(url);
  if (!blob.size || !blob.type.startsWith('image/') || blob.type === 'image/svg+xml') {
    throw new Error('生成文件不是有效图片');
  }
  return blob;
}

async function writeZipExcel(
  zip: JSZip,
  items: BatchProductItem[],
  downloadedShots: Set<string>,
) {
  const excelRows = await buildMatrixExportRows(items, undefined, {
    includeShot: (item, shotNo) => downloadedShots.has(`${item.id}:${shotNo}`),
    allowUpload: false,
  });
  if (excelRows.length === 0) return;
  const XLSX = await import('./batchExportSpreadsheet');
  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  worksheet['!cols'] = [
    { wch: 35 }, { wch: 22 }, { wch: 24 },
    { wch: 64 }, { wch: 64 }, { wch: 64 }, { wch: 64 },
    { wch: 42 }, { wch: 80 }, { wch: 28 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '生成成果清单');
  zip.file('生成成果清单.xlsx', XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
}

async function saveGeneratedZip(zip: JSZip, filename: string, deps: BatchExportDeps, stats: string) {
  deps.setToastMsg('正在完成极速无损归档写入...');
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (metadata) => {
    deps.setToastMsg(`正在完成极速无损归档写入 (${Math.round(metadata.percent)}%)...`);
  });
  await saveToDownloadDir(filename, zipBlob);
  deps.showToast(`批量成果包已极速触发下载！（${stats}）`);
}

async function exportClientZip(items: BatchProductItem[], deps: BatchExportDeps) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  let imageOk = 0;
  let imageFail = 0;
  const downloadedShots = new Set<string>();
  const folderNames = new Set<string>();
  const pending: Array<{ url: string; folder: JSZip; shotNo: number; itemId: string }> = [];

  for (const item of items) {
    const folderName = uniqueWorkshopFolderName(
      workshopProductFolderName(exportPromptGroupName(item), exportProductId(item), exportGeneratedTitle(item)),
      folderNames,
    );
    const productFolder = zip.folder(folderName);
    if (!productFolder) continue;
    for (const task of exportFourShots(item)) pending.push({ url: task.resultUrl!, folder: productFolder, shotNo: task.shot_no, itemId: item.id });
    for (const task of (item.tasks || []).filter(task => task.shot_no >= 1 && task.shot_no <= 4 && task.resultStatus !== 'superseded' && task.status === 'FAILURE')) {
      productFolder.file(`图${task.shot_no}.error.txt`, `该镜头未生成成功\n${task.error || '没有可下载的生成结果'}`);
      imageFail++;
    }
    const copywriting = formatWorkshopCopywriting(item.copywriting?.content);
    if (copywriting) productFolder.file('文案.txt', copywriting);
  }

  const queue = [...pending];
  const fetchWorker = async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      try {
        const blob = await fetchGeneratedImage(task.url);
        task.folder.file(`图${task.shotNo}.${blobExtFromMime(blob.type || '')}`, blob, { binary: true });
        downloadedShots.add(`${task.itemId}:${task.shotNo}`);
        imageOk++;
      } catch (fetchErr) {
        task.folder.file(`图${task.shotNo}.error.txt`, `图片下载失败\n原始URL: ${task.url}\n错误: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
        imageFail++;
      }
    }
  };
  await Promise.all(Array(Math.min(12, Math.max(1, queue.length))).fill(null).map(() => fetchWorker()));
  const stats = `图片 ${imageOk} 成功 / ${imageFail} 失败${imageFail > 0 ? '，失败说明已写入 ZIP' : ''}`;
  if (imageOk === 0) throw new Error(`所有图片获取失败（${stats}），请检查文件是否仍可访问`);
  if (imageFail > 0) zip.file('export-summary.json', JSON.stringify({ total: imageOk + imageFail, succeeded: imageOk, failed: imageFail, partial: true }, null, 2));
  await writeZipExcel(zip, items, downloadedShots);
  await saveGeneratedZip(zip, zipFileName('贝壳云图_批量生图矩阵'), deps, stats);
}

export async function exportBatchZip(items: BatchProductItem[], deps: BatchExportDeps) {
  const ready = productsWithTasks(items).filter(item => exportFourShots(item).length > 0);
  if (ready.length === 0) {
    deps.showToast('当前没有已成功生成的图片可供打包导出');
    return;
  }
  deps.setIsExportingZip(true);
  deps.showToast('正在启动高速并发拉取并打包，请稍候…');
  try {
    if (canNativeOfflineExport(ready)) {
      try {
        const result = await tryNativeOfflineZip(ready, zipFileName('贝壳云图_批量生图矩阵'), deps.setToastMsg);
        deps.showToast(zipResultMessage(result));
        return;
      } catch (nativeErr) {
        console.warn('[exportBatchZip] native offline export failed, falling back', nativeErr);
      }
    }
    await exportClientZip(ready, deps);
  } catch (err: unknown) {
    deps.showToast(`打包失败: ${err instanceof Error ? err.message : '未知错误'}`);
  } finally {
    deps.setIsExportingZip(false);
  }
}

export async function exportBatchExcel(items: BatchProductItem[], deps: BatchExportDeps) {
  const ready = productsWithTasks(items);
  if (ready.length === 0) {
    deps.showToast('当前没有生成记录可供导出');
    return;
  }
  deps.setIsExportingZip(true);
  try {
    const excelRows = await buildMatrixExportRows(ready, (cur, total) => {
      deps.setToastMsg(`正在整理矩阵发布表格 (${cur}/${total})...`);
    });
    if (excelRows.length === 0) {
      deps.showToast('未找到可导出的生产记录');
      return;
    }
    const XLSX = await import('./batchExportSpreadsheet');
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    worksheet['!cols'] = [
      { wch: 35 }, { wch: 22 }, { wch: 24 },
      { wch: 64 }, { wch: 64 }, { wch: 64 }, { wch: 64 },
      { wch: 42 }, { wch: 80 }, { wch: 28 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '生成成果清单');
    const excelBlob = new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileName = `贝壳云图_生成成果清单_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.xlsx`;
    await saveToDownloadDir(fileName, excelBlob);
    deps.showToast('已触发生产记录表格下载！');
  } catch (err: unknown) {
    deps.showToast(`导出表格失败: ${err instanceof Error ? err.message : '未知异常'}`);
  } finally {
    deps.setIsExportingZip(false);
  }
}

export async function exportSingleProductZip(item: BatchProductItem, deps: BatchExportDeps) {
  const successTasks = exportFourShots(item);
  if (successTasks.length === 0) {
    deps.showToast('该商品暂无已成功的生成图片可供导出');
    return;
  }
  deps.setExportingSingleItemId(item.id);
  deps.showToast(`正在极速打包【${item.title || item.itemId}】...`);
  try {
    const productName = workshopProductFolderName(exportPromptGroupName(item), exportProductId(item), exportGeneratedTitle(item));
    if (canNativeOfflineExport([item])) {
      try {
        const result = await tryNativeOfflineZip([item], `${productName}.zip`, deps.setToastMsg, true);
        deps.showToast(zipResultMessage(result, `【${item.title || item.itemId}】图片包`));
        return;
      } catch (nativeErr) {
        console.warn('[exportSingleProductZip] native offline export failed, falling back', nativeErr);
      }
    }
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    let imageOk = 0;
    let imageFail = 0;
    await Promise.all(successTasks.map(async task => {
      try {
        const blob = await fetchGeneratedImage(task.resultUrl!);
        zip.file(`图${task.shot_no}.${blobExtFromMime(blob.type || '')}`, blob, { binary: true });
        imageOk++;
      } catch (err) {
        zip.file(`图${task.shot_no}.error.txt`, `图片下载失败\n原始URL: ${task.resultUrl}\n错误: ${err instanceof Error ? err.message : String(err)}`);
        imageFail++;
      }
    }));
    if (imageOk === 0) throw new Error('所有图片获取失败，请检查文件是否仍可访问');
    if (imageFail > 0) zip.file('export-summary.json', JSON.stringify({ total: successTasks.length, succeeded: imageOk, failed: imageFail, partial: true }, null, 2));
    const copywriting = formatWorkshopCopywriting(item.copywriting?.content);
    if (copywriting) zip.file('文案.txt', copywriting);
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const savedVia = await saveToDownloadDir(`${productName}.zip`, zipBlob);
    deps.showToast(zipResultMessage({ total: successTasks.length, succeeded: imageOk, failed: imageFail, partial: imageFail > 0, savedVia }, `【${item.title || item.itemId}】图片包`));
  } catch (err: unknown) {
    deps.showToast(`单款打包失败: ${err instanceof Error ? err.message : '未知错误'}`);
  } finally {
    deps.setExportingSingleItemId(null);
  }
}

export async function downloadSingleTaskImage(url: string, filename: string | undefined, showToast: (msg: string) => void) {
  if (!url) {
    showToast('缺少图片地址');
    return;
  }
  showToast('正在下载高清原图...');
  try {
    const blob = await fetchGeneratedImage(url);
    const safeName = (filename || `image_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_');
    await saveToDownloadDir(`${safeName}.${blobExtFromMime(blob.type)}`, blob);
    showToast('已触发浏览器下载！');
  } catch (err: unknown) {
    showToast(`下载失败: ${err instanceof Error ? err.message : '网络异常'}`);
  }
}
