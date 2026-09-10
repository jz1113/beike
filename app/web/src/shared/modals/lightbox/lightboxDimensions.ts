/**
 * 灯箱小工具通用输出尺寸换算引擎
 * 根据所选的长宽比 (aspectRatio) 与画质档位 (quality: low/medium/high 或 1K/2K/4K)
 * 精确计算像素分辨率 (如 2448x3264, 2048x2048)
 */
export function calculateTargetDimensions(
  aspectRatio: string = '3:4',
  quality: string = 'medium',
  fallbackSize: string = '2448x3264',
): string {
  const aspect = (!aspectRatio || aspectRatio === 'smart') ? '3:4' : aspectRatio;

  const isHigh = quality === 'high' || quality === '4K';
  const isLow = quality === 'low' || quality === '1K';

  if (aspect === '1:1') {
    if (isHigh) return '2048x2048';
    if (isLow) return '1024x1024';
    return '1536x1536';
  }

  if (aspect === '3:4') {
    if (isHigh) return '2448x3264';
    if (isLow) return '1024x1365';
    return '1728x2304';
  }

  if (aspect === '4:3') {
    if (isHigh) return '3264x2448';
    if (isLow) return '1365x1024';
    return '2304x1728';
  }

  if (aspect === '9:16') {
    if (isHigh) return '1836x3264';
    if (isLow) return '1024x1820';
    return '1440x2560';
  }

  if (aspect === '16:9') {
    if (isHigh) return '3264x1836';
    if (isLow) return '1820x1024';
    return '2560x1440';
  }

  if (aspect === '3:2') {
    if (isHigh) return '3264x2176';
    if (isLow) return '1536x1024';
    return '2304x1536';
  }

  if (aspect === '2:3') {
    if (isHigh) return '2176x3264';
    if (isLow) return '1024x1536';
    return '1536x2304';
  }

  return fallbackSize || '2448x3264';
}
