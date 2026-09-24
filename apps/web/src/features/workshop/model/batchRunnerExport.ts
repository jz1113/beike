import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { fetchMediaBlob } from '@/shared/media/downloadMedia';
import { saveToDownloadDir } from '@/shared/desktop/desktopDownload';
import type { BatchProductItem } from './batchTypes';
import { blobExtFromMime, sanitizeShotTitle } from './batchRunnerIo';
import { buildMatrixExportRows } from './batchMatrixExport';
import { canNativeOfflineExport, tryNativeOfflineZip } from './batchZipNative';

export type { MatrixExportRow } from './batchMatrixExport';
export { buildMatrixExportRows, ensurePermanentImageUrl } from './batchMatrixExport';

export interface BatchExportDeps {
  setIsExportingZip: (v: boolean) => void;
  setExportingSingleItemId: (id: string | null) => void;
  setToastMsg: (msg: string | null) => void;
  showToast: (msg: string) => void;
}

function productsWithTasks(items: BatchProductItem[]) {
  return items.filter(item => (item.tasks || []).some(task => task.status === 'SUCCESS' || task.status === 'FAILURE'));
}

function zipFileName(prefix: string) {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.zip`;
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
  linkForShot?: (item: BatchProductItem, shotNo: number) => string | undefined,
) {
  const excelRows = await buildMatrixExportRows(items, undefined, { offline: true, linkForShot });
  if (excelRows.length === 0) return;
  const worksheet = XLSX.utils.json_to_sheet(excelRows);
  worksheet['!cols'] = [
    { wch: 30 }, { wch: 65 }, { wch: 32 }, { wch: 20 },
    { wch: 60 }, { wch: 60 }, { wch: 60 }, { wch: 60 },
    { wch: 60 }, { wch: 60 }, { wch: 60 }, { wch: 60 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '矩阵生产发布清单');
  zip.file('00_贝壳云图_矩阵生产清单.xlsx', XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }));
}

async function saveGeneratedZip(zip: JSZip, filename: string, deps: BatchExportDeps, stats: string) {
  deps.setToastMsg('正在完成极速无损归档写入...');
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (metadata) => {
    deps.setToastMsg(`正在完成极速无损归档写入 (${Math.round(metadata.percent)}%)...`);
  });
  const saveRes = await saveToDownloadDir(filename, zipBlob);
  if (saveRes === 'desktop') deps.showToast(`已成功保存至桌面下载目录！（${stats}）`);
  else deps.showToast(`批量成果包已极速触发下载！（${stats}）`);
}

async function exportClientZip(items: BatchProductItem[], deps: BatchExportDeps) {
  const zip = new JSZip();
  let imageOk = 0;
  let imageFail = 0;
  const zipLinks = new Map<string, string>();
  const pending: Array<{ url: string; folder: JSZip; folderName: string; baseName: string; shotNo: number; itemId: string }> = [];

  for (const item of items) {
    const safeTitle = (item.title || item.itemId || '未命名商品').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30);
    const folderName = `${item.itemId}_${safeTitle}`;
    const productFolder = zip.folder(folderName);
    if (!productFolder) continue;
    for (const task of (item.tasks || []).filter(entry => entry.status === 'SUCCESS' || entry.status === 'FAILURE')) {
      const baseName = `分镜${task.shot_no}_${sanitizeShotTitle(task.title, `镜头${task.shot_no}`)}`;
      if (task.status === 'SUCCESS' && task.resultUrl) {
        pending.push({ url: task.resultUrl, folder: productFolder, folderName, baseName, shotNo: task.shot_no, itemId: item.id });
      } else imageFail++;
    }
    if (item.copywriting) {
      productFolder.file(
        `AI种草文案_${item.itemId}.txt`,
        `【种草标题】：${item.copywriting.title}\n\n【笔记正文】：\n${item.copywriting.content}\n\n【热门标签】：${(item.copywriting.tags || []).map(t => `#${t}`).join(' ')}`
      );
    }
  }

  const queue = [...pending];
  const fetchWorker = async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      try {
        const blob = await fetchGeneratedImage(task.url);
        const finalFileName = `${task.baseName}.${blobExtFromMime(blob.type || '')}`;
        task.folder.file(finalFileName, blob, { binary: true });
        zipLinks.set(`${task.itemId}:${task.shotNo}`, `${task.folderName}/${finalFileName}`);
        imageOk++;
      } catch (fetchErr) {
        task.folder.file(`${task.baseName}.error.txt`, `图片下载失败\n原始URL: ${task.url}\n错误: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
        imageFail++;
      }
    }
  };
  await Promise.all(Array(Math.min(12, Math.max(1, queue.length))).fill(null).map(() => fetchWorker()));
  await writeZipExcel(zip, items, (item, shotNo) => zipLinks.get(`${item.id}:${shotNo}`));
  const stats = `图片 ${imageOk} 成功 / ${imageFail} 失败`;
  if (imageOk === 0) throw new Error(`所有图片获取失败（${stats}），请检查文件是否仍可访问`);
  await saveGeneratedZip(zip, zipFileName('贝壳云图_批量生图矩阵'), deps, stats);
}

export async function exportBatchZip(items: BatchProductItem[], deps: BatchExportDeps) {
  const ready = productsWithTasks(items);
  if (!ready.some(item => (item.tasks || []).some(task => task.status === 'SUCCESS' && task.resultUrl))) {
    deps.showToast('当前没有已成功生成的图片可供打包导出');
    return;
  }
  deps.setIsExportingZip(true);
  deps.showToast('正在启动高速并发拉取并打包，请稍候…');
  try {
    if (canNativeOfflineExport(ready)) {
      try {
        const result = await tryNativeOfflineZip(ready, zipFileName('贝壳云图_批量生图矩阵'), deps.setToastMsg);
        deps.showToast(result ? `已触发图片包下载：${result.completed}/${result.total} 张图片${result.completed < result.total ? '，失败详情见包内记录' : ''}` : '已触发批量图片包下载！');
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
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    worksheet['!cols'] = [
      { wch: 30 }, { wch: 65 }, { wch: 32 }, { wch: 20 },
      { wch: 60 }, { wch: 60 }, { wch: 60 }, { wch: 60 },
      { wch: 60 }, { wch: 60 }, { wch: 60 }, { wch: 60 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '矩阵生产发布清单');
    const excelBlob = new Blob([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileName = `贝壳云图_矩阵生产清单_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.xlsx`;
    const saveRes = await saveToDownloadDir(fileName, excelBlob);
    deps.showToast(saveRes === 'desktop' ? '已将生产记录表格保存至下载目录！' : '已触发生产记录表格下载！');
  } catch (err: unknown) {
    deps.showToast(`导出表格失败: ${err instanceof Error ? err.message : '未知异常'}`);
  } finally {
    deps.setIsExportingZip(false);
  }
}

export async function exportSingleProductZip(item: BatchProductItem, deps: BatchExportDeps) {
  const successTasks = (item.tasks || []).filter(task => task.status === 'SUCCESS' && task.resultUrl);
  if (successTasks.length === 0) {
    deps.showToast('该商品暂无已成功的生成图片可供导出');
    return;
  }
  deps.setExportingSingleItemId(item.id);
  deps.showToast(`正在极速打包【${item.title || item.itemId}】...`);
  try {
    if (canNativeOfflineExport([item])) {
      try {
        const result = await tryNativeOfflineZip([item], `贝壳云图_${item.itemId}.zip`, deps.setToastMsg);
        deps.showToast(result ? `已触发【${item.title || item.itemId}】图片包下载：${result.completed}/${result.total} 张` : `已触发【${item.title || item.itemId}】图片包下载！`);
        return;
      } catch (nativeErr) {
        console.warn('[exportSingleProductZip] native offline export failed, falling back', nativeErr);
      }
    }
    const zip = new JSZip();
    let imageOk = 0;
    let imageFail = 0;
    await Promise.all(successTasks.map(async (task, idx) => {
      try {
        const blob = await fetchGeneratedImage(task.resultUrl!);
        zip.file(`分镜${task.shot_no}_${sanitizeShotTitle(task.title, `镜头${idx + 1}`)}.${blobExtFromMime(blob.type || '')}`, blob, { binary: true });
        imageOk++;
      } catch (err) {
        console.warn('[handleExportSingleProductZip] 拉图失败:', task.resultUrl, err);
        imageFail++;
      }
    }));
    if (imageOk === 0) throw new Error('所有图片获取失败，请检查文件是否仍可访问');
    if (imageFail) zip.file('下载失败记录.txt', `${imageFail} 张图片获取失败，请回到工坊重试对应分镜。`);
    if (item.copywriting) {
      zip.file(`AI种草文案_${item.itemId}.txt`, `【种草标题】：${item.copywriting.title}\n\n【笔记正文】：\n${item.copywriting.content}\n\n【热门标签】：${(item.copywriting.tags || []).map(t => `#${t}`).join(' ')}`);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const saveRes = await saveToDownloadDir(`贝壳云图_${item.itemId}_${(item.title || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 30)}.zip`, zipBlob);
    deps.showToast(`${saveRes === 'desktop' ? '已保存' : '已触发下载'}【${item.title || item.itemId}】：图片 ${imageOk} 张${imageFail ? `，失败 ${imageFail} 张` : ''}`);
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
    const res = await saveToDownloadDir(`${safeName}.${blobExtFromMime(blob.type)}`, blob);
    showToast(res === 'desktop' ? '已保存至本地下载目录！' : '已触发浏览器下载！');
  } catch (err: unknown) {
    showToast(`下载失败: ${err instanceof Error ? err.message : '网络异常'}`);
  }
}
