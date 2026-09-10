import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { fetchMediaBlob, downloadMediaOrOpen } from '@/lib/downloadMedia';
import { saveToDownloadDir } from '@/lib/desktopDownload';
import { apiFetch } from '@/lib/apiClient';
import type { BatchProductItem } from './batchTypes';
import { blobExtFromMime, sanitizeShotTitle } from './batchRunnerUtils';

export interface BatchExportDeps {
  setIsExportingZip: (v: boolean) => void;
  setExportingSingleItemId: (id: string | null) => void;
  setToastMsg: (msg: string | null) => void;
  showToast: (msg: string) => void;
}

export interface MatrixExportRow {
  '任务标题': string;
  '任务文案': string;
  '商品名称': string;
  '商品ID': string;
  '图链接1': string;
  '图链接2': string;
  '图链接3': string;
  '图链接4': string;
}

/**
 * 若切片图片仍为浏览器本地临时 blob/data URL 或本地存储 /storage/... 路径，尝试并发上传至后端云端存储获取永久公开访问链接
 */
export async function ensurePermanentImageUrl(url: string, filename: string): Promise<string> {
  if (!url) return url;

  // 已为永久链接（OSS / CDN 域名），直接返回
  const looksAlreadyPermanent = /^(https?:)?\/\//i.test(url)
    && !url.startsWith('blob:')
    && !url.startsWith('data:')
    && !url.startsWith('/storage/')
    && /\.(aliyuncs\.com|myqcloud\.com|amazonaws\.com|r2\.dev|r2\.cloudflarestorage\.com|cos\.|qiniucdn|upaiyun|cdn\.)/i.test(url);
  if (looksAlreadyPermanent) {
    return url;
  }

  // 需要上传到 OSS 的类型：blob: / data: / 本地 /storage/...
  const needsUpload = url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('/') || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?=[:/])/i.test(url);
  if (needsUpload) {
    try {
      const blob = await fetchMediaBlob(url);
      if (!blob.size || !blob.type.startsWith('image/')) throw new Error('未获取到有效图片，临时图片可能已失效');
      const formData = new FormData();
      formData.append('category', 'generated/images');
      formData.append('file', blob, `${filename}.jpg`);
      const upRes = await apiFetch('/api/assets/storage/upload', {
        method: 'POST',
        body: formData,
      });
      const upData = await upRes.json().catch(() => ({}));
      const uploaded = upData.urls?.[0] || upData.url;
      if (!upRes.ok || upData.success === false || !uploaded) throw new Error(upData.error || `上传失败（HTTP ${upRes.status}）`);
      const parsed = new URL(uploaded);
      if (!['https:', 'http:'].includes(parsed.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i.test(parsed.hostname)) {
        throw new Error('存储返回本地地址，请检查阿里云 OSS 配置；不能用于外部表格导入');
      }
      return uploaded;
    } catch (err) {
      throw new Error(`图片 ${filename} 未完成云端上传，已停止导出：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 其他情况（未知格式）直接返回
  return url;
}

/**
 * 将种草工坊已生成的商品列表转换为矩阵发布标准格式行记录：
 * 表头严格对应：任务标题	任务文案	商品名称	商品ID	图链接1	图链接2	图链接3	图链接4
 */
export async function buildMatrixExportRows(
  items: BatchProductItem[],
  onProgress?: (current: number, total: number) => void
): Promise<MatrixExportRow[]> {
  const rows: MatrixExportRow[] = [];
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];

    // 1. 任务标题（种草标题优先，商品标题兜底）
    const taskTitle =
      item.copywriting?.title?.trim() || item.title?.trim() || item.itemId || '未命名任务';

    // 2. 任务文案（种草正文，附带热门标签）
    const content = item.copywriting?.content?.trim() || '';
    const tags = (item.copywriting?.tags || [])
      .map(t => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
    let taskCopywriting = content;
    if (tags && !content.includes('#')) {
      taskCopywriting = content ? `${content}\n\n${tags}` : tags;
    }

    // 3. 商品名称
    const productName = item.title?.trim() || '';

    // 4. 商品ID
    const productId = item.itemId?.trim() || item.id || '';

    // 5. 获取拆分后的 4 张分镜图片链接（图链接1-4）
    const sortedTasks = [...(item.tasks || [])].sort(
      (a, b) => (a.shot_no ?? 0) - (b.shot_no ?? 0)
    );
    const successTasks = sortedTasks.filter(t => t.status === 'SUCCESS' && t.resultUrl);

    // 优先取成功生成的切片，没有时从 sortedTasks 取对应位置的链接
    const rawUrls = [
      successTasks[0]?.resultUrl || sortedTasks[0]?.resultUrl || '',
      successTasks[1]?.resultUrl || sortedTasks[1]?.resultUrl || '',
      successTasks[2]?.resultUrl || sortedTasks[2]?.resultUrl || '',
      successTasks[3]?.resultUrl || sortedTasks[3]?.resultUrl || '',
    ];

    // 并发确保所有链接均为可公开访问的永久在线 URL（若为 blob 则自动上传）
    const finalUrls = await Promise.all(
      rawUrls.map((u, idx) =>
        u ? ensurePermanentImageUrl(u, `slice_${item.itemId || item.id}_${idx + 1}`) : Promise.resolve('')
      )
    );

    // 将上传后的永久链接同步写回对应 task（若原为 blob）
    finalUrls.forEach((permanentUrl, idx) => {
      if (permanentUrl && sortedTasks[idx] && sortedTasks[idx].resultUrl !== permanentUrl) {
        sortedTasks[idx].resultUrl = permanentUrl;
      }
    });

    const row: MatrixExportRow = {
      '任务标题': taskTitle,
      '任务文案': taskCopywriting,
      '商品名称': productName,
      '商品ID': productId,
      '图链接1': finalUrls[0] || '',
      '图链接2': finalUrls[1] || '',
      '图链接3': finalUrls[2] || '',
      '图链接4': finalUrls[3] || '',
    };

    rows.push(row);
    onProgress?.(i + 1, total);
  }

  return rows;
}

/**
 * 批量打包 ZIP（包含离线图片、文案文本与标准的 8 列矩阵清单表格）
 */
export async function exportBatchZip(
  items: BatchProductItem[],
  deps: BatchExportDeps,
) {
  const productsWithTasks = items.filter(i =>
    (i.tasks || []).some(t => t.status === 'SUCCESS' || t.status === 'FAILURE')
  );
  const hasSuccessImage = productsWithTasks.some(i =>
    (i.tasks || []).some(t => t.status === 'SUCCESS' && t.resultUrl)
  );
  if (!hasSuccessImage) {
    deps.showToast('当前没有已成功生成的图片可供打包导出');
    return;
  }

  deps.setIsExportingZip(true);
  deps.showToast('正在启动高速并发拉取并打包，请稍候…');

  try {
    const zip = new JSZip();
    let imageOk = 0;
    let imageFail = 0;

    interface FetchTaskItem {
      url: string;
      folder: JSZip;
      fileNameInZip: string;
      baseName: string;
      isGrid?: boolean;
      gridItemId?: string;
    }

    const pendingFetchTasks: FetchTaskItem[] = [];

    for (const item of productsWithTasks) {
      const safeTitle = (item.title || item.itemId || '未命名商品')
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 30);
      const folderName = `${item.itemId}_${safeTitle}`;
      const productFolder = zip.folder(folderName);
      if (!productFolder) continue;

      const exportTasks = (item.tasks || []).filter(
        t => t.status === 'SUCCESS' || t.status === 'FAILURE'
      );

      for (let idx = 0; idx < exportTasks.length; idx++) {
        const task = exportTasks[idx];
        const shotLabel = sanitizeShotTitle(task.title, `镜头${idx + 1}`);
        const baseName = `分镜${task.shot_no}_${shotLabel}`;

        if (task.status === 'SUCCESS' && task.resultUrl) {
          pendingFetchTasks.push({
            url: task.resultUrl,
            folder: productFolder,
            fileNameInZip: '',
            baseName,
          });
        } else {
          imageFail++;
        }
      }

      if (item.copywriting) {
        const txtContent = `【种草标题】：${item.copywriting.title}\n\n【笔记正文】：\n${item.copywriting.content}\n\n【热门标签】：${(item.copywriting.tags || []).map(t => `#${t}`).join(' ')}`;
        productFolder.file(`AI种草文案_${item.itemId}.txt`, txtContent);
      }
    }

    const totalImages = pendingFetchTasks.length;
    let completedCount = 0;
    const CONCURRENCY = 12;
    const queue = [...pendingFetchTasks];

    const fetchWorker = async () => {
      while (queue.length > 0) {
        const t = queue.shift();
        if (!t) break;
        try {
          const blob = await fetchMediaBlob(t.url);
          const ext = blobExtFromMime(blob.type || '');
          const finalFileName = `${t.baseName}.${ext}`;
          t.folder.file(finalFileName, blob, { binary: true });
          if (!t.isGrid) {
            imageOk++;
          }
        } catch (fetchErr) {
          console.warn('[handleExportZip] 并发拉图失败:', t.url, fetchErr);
          const errFileName = `${t.baseName}.error.txt`;
          t.folder.file(
            errFileName,
            `图片下载失败\n原始URL: ${t.url}\n错误: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
          );
          if (!t.isGrid) {
            imageFail++;
          }
        } finally {
          completedCount++;
          if (completedCount % 4 === 0 || completedCount === totalImages) {
            deps.setToastMsg(`正在高速下载并打包图片 (${completedCount}/${totalImages})...`);
          }
        }
      }
    };

    const workers = Array(Math.min(CONCURRENCY, Math.max(1, queue.length))).fill(null).map(() => fetchWorker());
    await Promise.all(workers);

    // 写入统一标准的矩阵发布 Excel 表格
    const excelRows = await buildMatrixExportRows(productsWithTasks, (cur, tot) => {
      deps.setToastMsg(`正在写入矩阵清单表格 (${cur}/${tot})...`);
    });

    if (excelRows.length > 0) {
      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      worksheet['!cols'] = [
        { wch: 30 }, // 任务标题
        { wch: 65 }, // 任务文案
        { wch: 32 }, // 商品名称
        { wch: 20 }, // 商品ID
        { wch: 60 }, // 图链接1
        { wch: 60 }, // 图链接2
        { wch: 60 }, // 图链接3
        { wch: 60 }, // 图链接4
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '矩阵生产发布清单');
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      zip.file('00_贝壳云图_矩阵生产清单.xlsx', excelBuffer);
    }

    deps.setToastMsg('正在完成极速无损归档写入...');
    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE' },
      (metadata) => {
        deps.setToastMsg(`正在完成极速无损归档写入 (${Math.round(metadata.percent)}%)...`);
      }
    );

    const zipFileName = `贝壳云图_批量生图矩阵_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.zip`;
    const saveRes = await saveToDownloadDir(zipFileName, zipBlob);
    const stats = `图片 ${imageOk} 成功 / ${imageFail} 失败`;

    if (imageOk === 0) {
      deps.showToast(`ZIP 已保存，但所有图片拉取失败（${stats}），请检查网络或代理`);
    } else if (saveRes === 'desktop') {
      deps.showToast(`已成功保存至桌面下载目录！（${stats}）`);
    } else {
      deps.showToast(`批量成果包已极速触发下载！（${stats}）`);
    }
  } catch (e: unknown) {
    console.error('打包异常:', e);
    deps.showToast(`打包失败: ${e instanceof Error ? e.message : '未知错误'}`);
  } finally {
    deps.setIsExportingZip(false);
  }
}

/**
 * 纯表格极速导出模式
 * 严格按照标准格式导出：任务标题	任务文案	商品名称	商品ID	图链接1	图链接2	图链接3	图链接4
 * 秒级生成 .xlsx 文件并触发保存/下载，表格中清晰呈现拆分后图链接1-4与文案信息
 */
export async function exportBatchExcel(
  items: BatchProductItem[],
  deps: BatchExportDeps,
) {
  const productsWithTasks = items.filter(i =>
    (i.tasks || []).some(t => t.status === 'SUCCESS' || t.status === 'FAILURE')
  );
  if (productsWithTasks.length === 0) {
    deps.showToast('当前没有生成记录可供导出');
    return;
  }

  deps.setIsExportingZip(true);
  try {
    deps.setToastMsg('正在整理矩阵发布表格并校验图片链接...');
    const excelRows = await buildMatrixExportRows(productsWithTasks, (cur, total) => {
      deps.setToastMsg(`正在整理矩阵发布表格 (${cur}/${total})...`);
    });

    if (excelRows.length === 0) {
      deps.showToast('未找到可导出的生产记录');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // 优化列宽，使任务标题、文案、商品ID与图链接1-4在 Excel 中完整清晰展现
    worksheet['!cols'] = [
      { wch: 30 }, // 任务标题
      { wch: 65 }, // 任务文案
      { wch: 32 }, // 商品名称
      { wch: 20 }, // 商品ID
      { wch: 60 }, // 图链接1
      { wch: 60 }, // 图链接2
      { wch: 60 }, // 图链接3
      { wch: 60 }, // 图链接4
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '矩阵生产发布清单');

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const excelBlob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const fileName = `贝壳云图_矩阵生产清单_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.xlsx`;
    const saveRes = await saveToDownloadDir(fileName, excelBlob);

    if (saveRes === 'desktop') {
      deps.showToast(`已成功将生产记录表格保存至桌面下载目录！`);
    } else {
      await downloadMediaOrOpen(URL.createObjectURL(excelBlob), fileName);
      deps.showToast(`已成功导出生产记录表格！`);
    }
  } catch (err: unknown) {
    console.error('导出Excel失败:', err);
    deps.showToast(`导出表格失败: ${err instanceof Error ? err.message : '未知异常'}`);
  } finally {
    deps.setIsExportingZip(false);
  }
}

export async function exportSingleProductZip(
  item: BatchProductItem,
  deps: BatchExportDeps,
) {
  const successTasks = (item.tasks || []).filter(t => t.status === 'SUCCESS' && t.resultUrl);
  if (successTasks.length === 0) {
    deps.showToast('该商品暂无已成功的生成图片可供导出');
    return;
  }

  deps.setExportingSingleItemId(item.id);
  deps.showToast(`正在极速打包【${item.title || item.itemId}】...`);

  try {
    const zip = new JSZip();
    const safeTitle = (item.title || item.itemId || '未命名商品')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 30);

    const tasksToFetch = successTasks.map((task, idx) => ({
      url: task.resultUrl!,
      name: `分镜${task.shot_no}_${sanitizeShotTitle(task.title, `镜头${idx + 1}`)}`,
    }));

    await Promise.all(
      tasksToFetch.map(async (t) => {
        try {
          const blob = await fetchMediaBlob(t.url);
          const ext = blobExtFromMime(blob.type || '');
          zip.file(`${t.name}.${ext}`, blob, { binary: true });
        } catch (err) {
          console.warn('[handleExportSingleProductZip] 拉图失败:', t.url, err);
        }
      })
    );

    if (item.copywriting) {
      const txtContent = `【种草标题】：${item.copywriting.title}\n\n【笔记正文】：\n${item.copywriting.content}\n\n【热门标签】：${(item.copywriting.tags || []).map(t => `#${t}`).join(' ')}`;
      zip.file(`AI种草文案_${item.itemId}.txt`, txtContent);
    }

    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE' },
      (metadata) => {
        deps.setToastMsg(`正在打包【${safeTitle}】(${Math.round(metadata.percent)}%)...`);
      }
    );

    const zipFileName = `贝壳云图_${item.itemId}_${safeTitle}.zip`;
    const saveRes = await saveToDownloadDir(zipFileName, zipBlob);
    if (saveRes === 'desktop') {
      deps.showToast(`已成功保存【${safeTitle}】到下载目录！`);
    } else {
      deps.showToast(`已触发【${safeTitle}】下载！`);
    }
  } catch (err: unknown) {
    console.error('单款打包失败:', err);
    deps.showToast(`单款打包失败: ${err instanceof Error ? err.message : '未知错误'}`);
  } finally {
    deps.setExportingSingleItemId(null);
  }
}

export async function downloadSingleTaskImage(
  url: string,
  filename: string | undefined,
  showToast: (msg: string) => void,
) {
  if (!url) {
    showToast('缺少图片地址');
    return;
  }
  showToast('正在下载高清原图...');
  try {
    const safeName = (filename || `image_${Date.now()}`).replace(/[\\/:*?"<>|]/g, '_');
    const res = await downloadMediaOrOpen(url, safeName);
    if (res === 'desktop') {
      showToast('已保存至本地下载目录！');
    } else {
      showToast('已触发浏览器下载！');
    }
  } catch (err: unknown) {
    console.error('下载单张图片失败:', err);
    showToast(`下载失败: ${err instanceof Error ? err.message : '网络异常'}`);
  }
}
