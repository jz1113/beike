import sharp from 'sharp';

/**
 * 在构图图上破坏原模特「五官 ID」，保留身体姿势与大致头位轮廓。
 * 旧版仅中心小块轻度马赛克，侧脸/大头照仍可被 edits 读出原脸 → 换脸失败。
 */
export async function obfuscateCompositionFaces(
  dataUrl?: string | null
): Promise<string | undefined> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return dataUrl || undefined;
  }

  try {
    const match = dataUrl.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
    if (!match?.[1]) return dataUrl;

    const input = Buffer.from(match[1], 'base64');
    const meta = await sharp(input, { failOn: 'none' }).rotate().metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (width < 32 || height < 32) return dataUrl;

    // 覆盖上半身常见人脸落点：中 / 左偏 / 右偏 三块强马赛克
    const zones = [
      { wRatio: 0.52, hRatio: 0.42, xBias: 0.5, yTop: 0.02 },
      { wRatio: 0.40, hRatio: 0.36, xBias: 0.32, yTop: 0.04 },
      { wRatio: 0.40, hRatio: 0.36, xBias: 0.68, yTop: 0.04 },
    ];

    const composites: { input: Buffer; left: number; top: number }[] = [];

    for (const z of zones) {
      const faceW = Math.max(32, Math.floor(width * z.wRatio));
      const faceH = Math.max(32, Math.floor(height * z.hRatio));
      const left = Math.max(0, Math.min(width - faceW, Math.floor(width * z.xBias - faceW / 2)));
      const top = Math.max(0, Math.min(height - faceH, Math.floor(height * z.yTop)));
      const w = Math.min(faceW, width - left);
      const h = Math.min(faceH, height - top);
      if (w < 24 || h < 24) continue;

      // 强像素化：块更小 → ID 更难恢复；再轻度降饱和，避免模型「脑补还原」原脸
      const mosaic = await sharp(input)
        .extract({ left, top, width: w, height: h })
        .resize({
          width: Math.max(6, Math.floor(w / 28)),
          height: Math.max(6, Math.floor(h / 28)),
          kernel: 'nearest',
        })
        .resize({ width: w, height: h, kernel: 'nearest' })
        .modulate({ brightness: 1.04, saturation: 0.55 })
        .blur(1.2)
        .toBuffer();

      composites.push({ input: mosaic, left, top });
    }

    if (composites.length === 0) return dataUrl;

    const out = await sharp(input)
      .composite(composites)
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch (err) {
    console.warn('[faceObfuscate] 构图人脸处理失败，回退原图:', (err as Error)?.message);
    return dataUrl;
  }
}

/**
 * 强化正脸垫图：大特写方形裁切，眼睛/鼻梁保持锐利以锁 ID；
 * 对嘴周与眼周做局部柔化，削弱证件照死板表情/眨眼/嘟嘴，但不抹掉骨相。
 */
export async function emphasizeIdentityFacePlate(
  dataUrl?: string | null
): Promise<string | undefined> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return dataUrl || undefined;
  }

  try {
    const match = dataUrl.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
    if (!match?.[1]) return dataUrl;

    const input = Buffer.from(match[1], 'base64');
    const meta = await sharp(input, { failOn: 'none' }).rotate().metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (width < 32 || height < 32) return dataUrl;

    // 更大脸占比，提高 edits 对 ID 的注意力
    const side = Math.floor(Math.min(width, height) * 0.88);
    const left = Math.floor((width - side) / 2);
    const top = Math.max(0, Math.floor(height * 0.04));
    const extractTop = Math.min(top, Math.max(0, height - side));
    const extractH = Math.min(side, height - extractTop);

    const cropped = await sharp(input)
      .rotate()
      .extract({
        left: Math.max(0, left),
        top: extractTop,
        width: side,
        height: extractH,
      })
      .resize({ width: 1280, height: 1280, fit: 'cover' })
      .sharpen({ sigma: 0.8 })
      .toBuffer();

    // 眼周/眉弓轻柔化：削弱眨眼、挑眉、瞪眼，强度低于嘴周以免伤眼型 ID
    const eyeTop = Math.floor(1280 * 0.28);
    const eyeH = Math.floor(1280 * 0.22);
    const eyeSoft = await sharp(cropped)
      .extract({ left: Math.floor(1280 * 0.14), top: eyeTop, width: Math.floor(1280 * 0.72), height: eyeH })
      .blur(3.5)
      .toBuffer();

    // 嘴周柔化（保留唇形轮廓），避免模型抄证件照/嘟嘴表情
    const mouthTop = Math.floor(1280 * 0.58);
    const mouthH = 1280 - mouthTop;
    const mouthSoft = await sharp(cropped)
      .extract({ left: Math.floor(1280 * 0.18), top: mouthTop, width: Math.floor(1280 * 0.64), height: mouthH })
      .blur(6)
      .toBuffer();

    const out = await sharp(cropped)
      .composite([
        {
          input: eyeSoft,
          left: Math.floor(1280 * 0.14),
          top: eyeTop,
        },
        {
          input: mouthSoft,
          left: Math.floor(1280 * 0.18),
          top: mouthTop,
        },
      ])
      .jpeg({ quality: 93, mozjpeg: true })
      .toBuffer();

    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch (err) {
    console.warn('[faceObfuscate] 正脸强化失败，回退原图:', (err as Error)?.message);
    return dataUrl;
  }
}
