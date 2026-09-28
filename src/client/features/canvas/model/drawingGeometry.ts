import type { CanvasNode } from './types';

/** One geometry source for the preview, title, connection anchors and canvas bounds. */
export function drawingGeometry(node: CanvasNode) {
  const video = node.generationKind === 'video';
  const fallback = video ? 16 / 9 : 1;
  const [width, height] = (node.drawing?.aspect || '').split(':').map(Number);
  const selectedRatio = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : fallback;
  const hasResult = Boolean(node.imageUrl || node.videoUrl);
  const resultRatio = node.resultWidth && node.resultHeight ? node.resultWidth / node.resultHeight : 0;
  // Existing results retain their actual dimensions when next-generation settings change.
  const ratio = hasResult && Number.isFinite(resultRatio) && resultRatio > 0 ? resultRatio : selectedRatio;
  const longestSide = video ? 400 : 280;
  return ratio >= 1
    ? { width: longestSide, height: longestSide / ratio }
    : { width: longestSide * ratio, height: longestSide };
}
