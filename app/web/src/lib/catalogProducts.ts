import { apiFetch } from '@/lib/apiClient';

export function persistSelectedProductImage(productId: string, picUrl: string): void {
  void apiFetch('/api/catalog/products', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: productId, picUrl, selectedImages: [picUrl] }),
  }).catch(() => {});
}
