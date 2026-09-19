import type { BatchProductItem } from './batchTypes';

/**
 * 切换单个商品的图片选中状态（选中/取消选中），同时联动 coverImage
 */
export function toggleProductImageSelection(
  items: BatchProductItem[],
  itemId: string,
  imgUrl: string
): BatchProductItem[] {
  return items.map(p => {
    if (p.id !== itemId) return p;
    const current = p.selectedProductImages || [];
    const next = current.includes(imgUrl)
      ? current.filter(u => u !== imgUrl)
      : [...current, imgUrl];
    return { ...p, selectedProductImages: next, coverImage: next[0] || p.coverImage };
  });
}

/**
 * 批量设置单个商品的选中图片（all_main / all / first / clear），同时联动 coverImage
 */
export function batchSetProductImages(
  items: BatchProductItem[],
  itemId: string,
  mode: 'all_main' | 'all' | 'first' | 'clear'
): BatchProductItem[] {
  return items.map(p => {
    if (p.id !== itemId) return p;
    let next: string[] = [];
    if (mode === 'all_main') next = p.allTypedImages.filter(t => t.type === 'main').map(t => t.url);
    if (mode === 'all') next = p.allTypedImages.map(t => t.url);
    if (mode === 'first') next = p.allTypedImages.slice(0, 1).map(t => t.url);
    if (mode === 'clear') next = [];
    return { ...p, selectedProductImages: next, coverImage: next[0] || p.coverImage };
  });
}

/**
 * 切换单个商品的参考对标图片选中状态（选中/取消选中）
 */
export function toggleReferenceImageSelection(
  items: BatchProductItem[],
  itemId: string,
  imgUrl: string
): BatchProductItem[] {
  return items.map(p => {
    if (p.id !== itemId) return p;
    const current = p.selectedReferenceImages || [];
    const next = current.includes(imgUrl)
      ? current.filter(u => u !== imgUrl)
      : [...current, imgUrl];
    return { ...p, selectedReferenceImages: next };
  });
}
