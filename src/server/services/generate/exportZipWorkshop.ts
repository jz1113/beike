import JSZip from 'jszip';
import type { ExportZipBody } from '@shared/contracts/exportZip';
import {
  formatWorkshopCopywriting,
  uniqueWorkshopFolderName,
  workshopProductFolderName,
  type WorkshopExportRow,
} from '@shared/domain/workshop/workshopExport';
import { addWorkshopExportManifest, TXT_FILE_OPTS, sanitizeFileSystemName } from './exportZipFiles';

type Product = NonNullable<ExportZipBody['products']>[number];
type Image = NonNullable<Product['images']>[number];

function publicImageLink(originalUrl?: string, storageUrl?: string): string {
  for (const candidate of [originalUrl, storageUrl]) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
    } catch {
      // ZIP can read /storage paths, but the spreadsheet needs a public absolute URL.
    }
  }
  return '';
}

export async function addWorkshopProductsToZip(
  zip: JSZip,
  products: Product[],
  options: {
    singleProductExport: boolean;
    batchTitle: string;
    downloadConcurrency: number;
    addMediaFile: (folder: JSZip, url: string, filename: string, imageOnly?: boolean) => Promise<boolean>;
    signal?: AbortSignal;
  },
): Promise<{ completed: number; total: number; filename: string }> {
  const single = options.singleProductExport && products.length === 1;
  const rows: WorkshopExportRow[] = [];
  const folderNames = new Set<string>();
  const pending: Array<{ folder: JSZip; image: Image; shotNo: number; row: WorkshopExportRow }> = [];

  for (let index = 0; index < products.length; index++) {
    const product = products[index];
    const productId = product.skuId?.trim() || `商品_${index + 1}`;
    const groupName = product.promptAssetGroupName?.trim() || '未绑定图组';
    const folderName = uniqueWorkshopFolderName(
      workshopProductFolderName(groupName, productId, product.copywritingTitle?.trim()), folderNames
    );
    const folder = single ? zip : zip.folder(folderName);
    if (!folder) continue;

    const copywriting = formatWorkshopCopywriting(product.copywritingContent);
    if (copywriting) folder.file('文案.txt', copywriting, TXT_FILE_OPTS);

    const row: WorkshopExportRow = {
      '商品名称': product.title?.trim() || product.productTitle?.trim() || '',
      '商品类目': product.category?.trim() || '',
      '商品id': productId,
      '生成图片链接1': '',
      '生成图片链接2': '',
      '生成图片链接3': '',
      '生成图片链接4': '',
      '标题': product.copywritingTitle?.trim() || '',
      '文案': copywriting,
      '对应生成的提示词资产分组组名': groupName,
    };
    rows.push(row);

    const shots = new Map<number, Image>();
    for (let imageIndex = 0; imageIndex < product.images.length; imageIndex++) {
      const image = product.images[imageIndex];
      const shotNo = typeof image === 'string' ? imageIndex + 1 : image.shotNo ?? imageIndex + 1;
      if (Number.isInteger(shotNo) && shotNo >= 1 && shotNo <= 4) shots.set(shotNo, image);
    }
    for (const [shotNo, image] of shots) pending.push({ folder, image, shotNo, row });
  }

  let completed = 0;
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      options.signal?.throwIfAborted();
      const task = pending[next++];
      const url = typeof task.image === 'string' ? task.image : task.image.url;
      if (!await options.addMediaFile(task.folder, url, `图${task.shotNo}`, true)) continue;
      task.row[`生成图片链接${task.shotNo}` as keyof WorkshopExportRow] = publicImageLink(
        typeof task.image === 'string' ? undefined : task.image.originalUrl,
        url,
      );
      completed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.downloadConcurrency, pending.length) }, () => worker()));
  if (!single) addWorkshopExportManifest(zip, rows);
  const filename = single
    ? workshopProductFolderName(products[0].promptAssetGroupName?.trim() || '未绑定图组', products[0].skuId?.trim() || '未知商品', products[0].copywritingTitle?.trim())
    : sanitizeFileSystemName(options.batchTitle, '贝壳云图_批量生图矩阵');
  return { completed, total: pending.length, filename };
}
