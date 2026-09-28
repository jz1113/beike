import { db } from './access';
import { normalizeImageUrlToStandardJpg } from '@shared/domain/media/drawing';

export const productRepository = {
  findCollected: (platform: string, itemId: string) => db.product.findFirst({
    where: { platform, itemId },
    orderBy: { createdAt: 'desc' },
  }),
  async saveCollected(platform: string, itemId: string, data: { title: string; picUrl: string; detailUrls: string }) {
    const existing = await db.product.findFirst({ where: { platform, itemId } });
    return existing
      ? db.product.update({ where: { id: existing.id }, data })
      : db.product.create({ data: { platform, itemId, ...data } });
  },
  async list(page: number, pageSize: number) {
    const [total, products] = await Promise.all([
      db.product.count(),
      db.product.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, products };
  },
  async save(input: { platform: string; itemId: string; title: string; cleanPicUrl: string; savedImages: string[] }) {
    const { platform, itemId, title, cleanPicUrl, savedImages } = input;
    const existing = await db.product.findFirst({ where: { platform, itemId } });
    if (existing) {
      return db.product.update({
        where: { id: existing.id },
        data: { title, picUrl: cleanPicUrl || normalizeImageUrlToStandardJpg(existing.picUrl), detailUrls: JSON.stringify({ main: savedImages }) },
      });
    }
    return db.product.create({ data: { platform, itemId, title, picUrl: cleanPicUrl, detailUrls: JSON.stringify({ main: savedImages }) } });
  },
  update: (id: string, data: { title?: string; itemId?: string; picUrl?: string; detailUrls?: string }) => db.product.update({ where: { id }, data }),
  findMedia: (id: string) => db.product.findUnique({ where: { id }, select: { picUrl: true, detailUrls: true } }),
  delete: (id: string) => db.product.delete({ where: { id } }),
};
