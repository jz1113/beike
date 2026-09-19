import type { BatchProductItem } from './batchTypes';

export function hasCompleteCopywriting(item: BatchProductItem): boolean {
  return Boolean(item.copywriting?.title?.trim() && item.copywriting?.content?.trim());
}

export function getCopywritingStatusLabel(item: BatchProductItem): string {
  if (item.isCopywritingGenerating) return '文案生成中';
  if (item.copywritingError) return hasCompleteCopywriting(item) ? '文案重写失败，原稿已保留' : '文案失败，待重试';
  return hasCompleteCopywriting(item) ? '文案已就绪' : '文案待生成';
}

