/**
 * 贝壳云图 · 2×2 四宫格智能无损切片工具 (Grid Slicer)
 * 将单张 2×2 拼图大图快速、无损均分为 4 张独立分镜高清图片 (左上、右上、左下、右下)
 */

import { fetchMediaBlob } from '@/lib/downloadMedia';

export interface SlicedShots {
  shot1Url: string; // 左上
  shot2Url: string; // 右上
  shot3Url: string; // 左下
  shot4Url: string; // 右下
}

/**
 * 加载图片元素，支持 CORS 跨域处理与 blob URL
 */
function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 非本地相对路径或非 blob 时设置 crossOrigin
    if (!url.startsWith('blob:') && !url.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`无法加载图片进行切片: ${url} (${e})`));
    img.src = url;
  });
}

/**
 * 安全加载图片：通过 fetchMediaBlob 统一代理/缓存通道，避免 Canvas 跨域污染。
 */
async function loadSafeImageElement(imageUrl: string): Promise<{ img: HTMLImageElement; cleanup?: () => void }> {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('切片图片地址不能为空');
  }

  if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
    const img = await loadImageElement(imageUrl);
    return { img };
  }

  const blob = await fetchMediaBlob(imageUrl);
  const blobUrl = URL.createObjectURL(blob);
  const img = await loadImageElement(blobUrl);
  return {
    img,
    cleanup: () => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {
        /* ignore */
      }
    },
  };
}

export interface GridDividerBounds {
  outerLeft: number;
  outerTop: number;
  outerRight: number;
  outerBottom: number;
  splitLeft: number;
  splitRight: number;
  splitTop: number;
  splitBottom: number;
}

/**
 * 智能白边与十字分割线检测算法：
 * 分析图像像素分布，精确探测中间十字中缝与四周外边框的白色/浅色分隔带，
 * 并在切片时自动精准切除，确保切片出的 4 张独立分镜图 100% 满铺无白边。
 */
export function detectGridDividerBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): GridDividerBounds {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  // 默认无白边、精确均分
  let outerLeft = 0;
  let outerTop = 0;
  let outerRight = width;
  let outerBottom = height;
  let splitLeft = halfW;
  let splitRight = halfW;
  let splitTop = halfH;
  let splitBottom = halfH;

  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // 辅助函数：判断某像素是否为白色/高亮浅色分割线（RGB 均值 >= 235 且色差很小）
    const isWhitePixel = (x: number, y: number) => {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 20) return true; // 透明亦视作分割
      // 高亮浅色白线
      return r >= 235 && g >= 235 && b >= 235;
    };

    // 1. 垂直中缝扫描 (在 halfW +/- 6% 范围内扫描是否存在连续的垂直白线)
    const scanRadiusX = Math.min(Math.floor(width * 0.06), 80);
    const minCol = Math.max(1, halfW - scanRadiusX);
    const maxCol = Math.min(width - 2, halfW + scanRadiusX);

    const colIsWhite: boolean[] = [];
    for (let x = minCol; x <= maxCol; x++) {
      let whiteCount = 0;
      const stepY = 2;
      let totalSampled = 0;
      for (let y = 0; y < height; y += stepY) {
        totalSampled++;
        if (isWhitePixel(x, y)) {
          whiteCount++;
        }
      }
      // 如果整列有 85% 以上为白色/浅色，则判定为中缝分割线
      colIsWhite[x] = (whiteCount / totalSampled) >= 0.85;
    }

    // 寻找包围 center 的连续白线区间
    let vStart = -1;
    let vEnd = -1;
    for (let x = minCol; x <= maxCol; x++) {
      if (colIsWhite[x]) {
        if (vStart === -1) vStart = x;
        vEnd = x;
      }
    }

    if (vStart !== -1 && vEnd !== -1 && (vEnd - vStart + 1) >= 2) {
      // 找到了白线，向两侧安全扩展 1-2px 避免边缘抗锯齿残留
      splitLeft = Math.max(0, vStart - 1);
      splitRight = Math.min(width, vEnd + 2);
    }

    // 2. 水平中缝扫描 (在 halfH +/- 6% 范围内扫描是否存在连续的水平白线)
    const scanRadiusY = Math.min(Math.floor(height * 0.06), 80);
    const minRow = Math.max(1, halfH - scanRadiusY);
    const maxRow = Math.min(height - 2, halfH + scanRadiusY);

    const rowIsWhite: boolean[] = [];
    for (let y = minRow; y <= maxRow; y++) {
      let whiteCount = 0;
      const stepX = 2;
      let totalSampled = 0;
      for (let x = 0; x < width; x += stepX) {
        totalSampled++;
        if (isWhitePixel(x, y)) {
          whiteCount++;
        }
      }
      rowIsWhite[y] = (whiteCount / totalSampled) >= 0.85;
    }

    let hStart = -1;
    let hEnd = -1;
    for (let y = minRow; y <= maxRow; y++) {
      if (rowIsWhite[y]) {
        if (hStart === -1) hStart = y;
        hEnd = y;
      }
    }

    if (hStart !== -1 && hEnd !== -1 && (hEnd - hStart + 1) >= 2) {
      splitTop = Math.max(0, hStart - 1);
      splitBottom = Math.min(height, hEnd + 2);
    }

    // 3. 四周外边框扫描 (外缘 0..3% 范围)
    const maxOuterScanX = Math.min(Math.floor(width * 0.03), 40);
    for (let x = 0; x < maxOuterScanX; x++) {
      let whiteCount = 0;
      for (let y = 0; y < height; y += 4) {
        if (isWhitePixel(x, y)) whiteCount++;
      }
      if (whiteCount / (height / 4) >= 0.9) {
        outerLeft = x + 1;
      } else {
        break;
      }
    }

    for (let x = width - 1; x >= width - maxOuterScanX; x--) {
      let whiteCount = 0;
      for (let y = 0; y < height; y += 4) {
        if (isWhitePixel(x, y)) whiteCount++;
      }
      if (whiteCount / (height / 4) >= 0.9) {
        outerRight = x;
      } else {
        break;
      }
    }

    const maxOuterScanY = Math.min(Math.floor(height * 0.03), 40);
    for (let y = 0; y < maxOuterScanY; y++) {
      let whiteCount = 0;
      for (let x = 0; x < width; x += 4) {
        if (isWhitePixel(x, y)) whiteCount++;
      }
      if (whiteCount / (width / 4) >= 0.9) {
        outerTop = y + 1;
      } else {
        break;
      }
    }

    for (let y = height - 1; y >= height - maxOuterScanY; y--) {
      let whiteCount = 0;
      for (let x = 0; x < width; x += 4) {
        if (isWhitePixel(x, y)) whiteCount++;
      }
      if (whiteCount / (width / 4) >= 0.9) {
        outerBottom = y;
      } else {
        break;
      }
    }
  } catch (err) {
    console.warn('[detectGridDividerBounds] 检测白边异常，回退默认均分:', err);
  }

  // 兜底安全校验
  if (splitLeft <= outerLeft + 20 || splitRight >= outerRight - 20) {
    splitLeft = halfW;
    splitRight = halfW;
  }
  if (splitTop <= outerTop + 20 || splitBottom >= outerBottom - 20) {
    splitTop = halfH;
    splitBottom = halfH;
  }

  return {
    outerLeft,
    outerTop,
    outerRight,
    outerBottom,
    splitLeft,
    splitRight,
    splitTop,
    splitBottom,
  };
}

export interface SliceGridOptions {
  outputFormat?: 'image/jpeg' | 'image/png';
  quality?: number;
  autoTrimBorders?: boolean;
  /** 目标输出宽度，默认 1440 */
  targetWidth?: number;
  /** 目标输出高度，默认 1920 */
  targetHeight?: number;
}

/**
 * 核心切片函数：将 2×2 大图切为 4 张独立的高清图片 (Blob URL)
 * 具备智能白边/十字分割线自动检测与切除功能，并统一裁剪缩放至 1440×1920 高清 3:4 比例
 * 顺序固定为：
 * 0: 左上 (Top-Left) -> 分镜 1 (生活肖像)
 * 1: 右上 (Top-Right) -> 分镜 2 (侧颜微风光影)
 * 2: 左下 (Bottom-Left) -> 分镜 3 (部位超清微距)
 * 3: 右下 (Bottom-Right) -> 分镜 4 (松弛生活瞬间)
 */
export async function sliceGridImage2x2(
  imageUrl: string,
  options?: SliceGridOptions
): Promise<[string, string, string, string]> {
  const format = options?.outputFormat || 'image/jpeg';
  const quality = options?.quality ?? 0.95;
  const autoTrim = options?.autoTrimBorders ?? true;
  const targetOutputW = options?.targetWidth ?? 1440;
  const targetOutputH = options?.targetHeight ?? 1920;
  const targetRatio = targetOutputW / targetOutputH; // 3:4 = 0.75

  const { img, cleanup } = await loadSafeImageElement(imageUrl);

  const { naturalWidth: fullW, naturalHeight: fullH } = img;
  if (!fullW || !fullH || fullW < 100 || fullH < 100) {
    throw new Error(`图片尺寸异常 (${fullW}x${fullH})，无法执行四宫格切片`);
  }

  // 创建检测 Canvas
  const inspectCanvas = document.createElement('canvas');
  inspectCanvas.width = fullW;
  inspectCanvas.height = fullH;
  const inspectCtx = inspectCanvas.getContext('2d');
  if (!inspectCtx) {
    throw new Error('无法初始化 Canvas 2D 上下文进行图像检测');
  }
  inspectCtx.drawImage(img, 0, 0, fullW, fullH);

  let bounds: GridDividerBounds;
  if (autoTrim) {
    bounds = detectGridDividerBounds(inspectCtx, fullW, fullH);
  } else {
    const halfW = Math.floor(fullW / 2);
    const halfH = Math.floor(fullH / 2);
    bounds = {
      outerLeft: 0,
      outerTop: 0,
      outerRight: fullW,
      outerBottom: fullH,
      splitLeft: halfW,
      splitRight: halfW,
      splitTop: halfH,
      splitBottom: halfH,
    };
  }

  // 释放检测 Canvas 内存
  inspectCanvas.width = 0;
  inspectCanvas.height = 0;

  // 根据智能白边检测结果构建 4 个象限的裁剪区域
  const quadrants = [
    // 0: 左上 (Top-Left)
    {
      sx: bounds.outerLeft,
      sy: bounds.outerTop,
      sw: bounds.splitLeft - bounds.outerLeft,
      sh: bounds.splitTop - bounds.outerTop,
    },
    // 1: 右上 (Top-Right)
    {
      sx: bounds.splitRight,
      sy: bounds.outerTop,
      sw: bounds.outerRight - bounds.splitRight,
      sh: bounds.splitTop - bounds.outerTop,
    },
    // 2: 左下 (Bottom-Left)
    {
      sx: bounds.outerLeft,
      sy: bounds.splitBottom,
      sw: bounds.splitLeft - bounds.outerLeft,
      sh: bounds.outerBottom - bounds.splitBottom,
    },
    // 3: 右下 (Bottom-Right)
    {
      sx: bounds.splitRight,
      sy: bounds.splitBottom,
      sw: bounds.outerRight - bounds.splitRight,
      sh: bounds.outerBottom - bounds.splitBottom,
    },
  ];

  const slicedUrls: string[] = [];

  for (let i = 0; i < quadrants.length; i++) {
    const q = quadrants[i];
    const rawW = Math.max(10, q.sw);
    const rawH = Math.max(10, q.sh);
    const sourceRatio = rawW / rawH;

    let srcCropX = q.sx;
    let srcCropY = q.sy;
    let srcCropW = rawW;
    let srcCropH = rawH;

    if (sourceRatio > targetRatio) {
      // 象限较宽：按高度对齐，居中裁剪宽度，保证输出无形变 3:4 比例
      srcCropW = rawH * targetRatio;
      srcCropH = rawH;
      srcCropX = q.sx + (rawW - srcCropW) / 2;
      srcCropY = q.sy;
    } else {
      // 象限较窄或等比：按宽度对齐，居中裁剪高度
      srcCropW = rawW;
      srcCropH = rawW / targetRatio;
      srcCropX = q.sx;
      srcCropY = q.sy + (rawH - srcCropH) / 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetOutputW;
    canvas.height = targetOutputH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法初始化 Canvas 2D 上下文');
    }

    // 高质量图像缩放和平滑绘制
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      img,
      srcCropX,
      srcCropY,
      srcCropW,
      srcCropH,
      0,
      0,
      targetOutputW,
      targetOutputH
    );

    const blob = await new Promise<Blob | null>((res) => {
      canvas.toBlob((b) => res(b), format, quality);
    });

    if (blob) {
      const sliceUrl = URL.createObjectURL(blob);
      slicedUrls.push(sliceUrl);
    } else {
      // 降级为 data URL
      const dataUrl = canvas.toDataURL(format, quality);
      slicedUrls.push(dataUrl);
    }

    // 及时清理 canvas 引用，辅助垃圾回收
    canvas.width = 0;
    canvas.height = 0;
  }

  cleanup?.();

  return [slicedUrls[0], slicedUrls[1], slicedUrls[2], slicedUrls[3]];
}

