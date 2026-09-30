export interface OutputDimensions { width: number; height: number }

export const OUTPUT_MAX_EDGE = 4096;

export function assertOutputDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > OUTPUT_MAX_EDGE || height > OUTPUT_MAX_EDGE) {
    throw new Error(`宽和高须为 1–${OUTPUT_MAX_EDGE} 的整数像素`);
  }
}

export function parseOutputDimensions(size?: string): OutputDimensions | undefined {
  const match = /^(\d+)x(\d+)$/.exec(size || '');
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  try { assertOutputDimensions(width, height); return { width, height }; }
  catch { return undefined; }
}

export function outputAspectLabel({ width, height }: OutputDimensions): string {
  let a = width, b = height;
  while (b) { const remainder = a % b; a = b; b = remainder; }
  return `${width / a}:${height / a}`;
}
