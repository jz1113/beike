import { db } from './access';
import { organizationData } from './assetOrganization';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export async function importLibraryBackup(body: Record<string, any>, _created: unknown[], client: Prisma.TransactionClient = db) {
  void _created;
  const categoryMap = new Map<string, string>();
  const albumMap = new Map<string, string>();
  const categories = Array.isArray(body.productCategories) ? body.productCategories : [];
  const albums = Array.isArray(body.albums) ? body.albums : [];
  const parents = categories.filter((c: any) => !c.parentId);
  const children = categories.filter((c: any) => c.parentId);
  for (const cat of [...parents, ...children]) {
    const parentId = cat.parentId ? categoryMap.get(cat.parentId) || null : null;
    const row = await client.assetProductCategory.create({
      data: { name: cat.name, parentId, position: Number(cat.position) || 0 },
    });
    if (typeof cat.id === 'string') categoryMap.set(cat.id, row.id);
  }
  for (const album of albums) {
    const productCategoryId = album.productCategoryId ? categoryMap.get(album.productCategoryId) || null : null;
    const row = await client.promptAlbum.create({
      data: { name: album.name, sourceKey: randomUUID(), productCategoryId },
    });
    if (typeof album.id === 'string') albumMap.set(album.id, row.id);
  }
  return { categoryMap, albumMap };
}

export function remapItemData(data: Record<string, unknown>, maps: { categoryMap: Map<string, string>; albumMap: Map<string, string> }) {
  const next = { ...data };
  if (typeof next.albumId === 'string' && maps.albumMap.has(next.albumId)) next.albumId = maps.albumMap.get(next.albumId);
  if (typeof next.productCategoryIds === 'string') {
    try {
      const parsed = JSON.parse(next.productCategoryIds);
      if (Array.isArray(parsed)) {
        next.productCategoryIds = JSON.stringify(parsed.map((id) => maps.categoryMap.get(id) || id));
      }
    } catch { /* keep */ }
  }
  return next;
}

export async function withOrganization(type: string, data: Record<string, unknown>, client: Prisma.TransactionClient = db) {
  return { ...data, ...(await organizationData(client, type, data)) };
}
