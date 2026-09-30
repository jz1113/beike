import { fetchMediaBlob } from '@client/shared/media/downloadMedia';

/** 智能清洗缩略图 URL 还原最高清原始资源 */
export function cleanOriginalMediaUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl, window.location.href);
    parsed.searchParams.delete('x-oss-process');
    parsed.searchParams.delete('thumb');
    parsed.searchParams.delete('width');
    parsed.searchParams.delete('height');
    return parsed.toString();
  } catch {
    return rawUrl.replace(/[?&]x-oss-process=[^&]+/, '').replace(/[?&]thumb=[^&]+/, '');
  }
}

/** 将图像 Blob 写入系统剪贴板（支持在微信/PS/飞书等处直接 Ctrl+V 粘贴） */
export async function copyImageToClipboard(imageUrl: string): Promise<boolean> {
  try {
    const blob = await fetchMediaBlob(imageUrl);
    let pngBlob = blob;

    // 现代浏览器与操作系统剪贴板对非 png 格式兼容较差，自动转换为标准 PNG Blob
    if (blob.type !== 'image/png') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const objUrl = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = objUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法初始化 Canvas 2D 绘图上下文');
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(objUrl);

      pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas 转换 PNG 失败'))), 'image/png');
      });
    }

    if (navigator.clipboard && typeof navigator.clipboard.write === 'function') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob,
        }),
      ]);
      return true;
    }
  } catch (err) {
    console.warn('[GlobalContextMenu] 写入系统图像剪贴板失败，自动回退至复制链接:', err);
  }

  // 极端受限降级：复制图片直链
  try {
    await navigator.clipboard.writeText(imageUrl);
    return true;
  } catch {
    return false;
  }
}

