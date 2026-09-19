import { prisma } from '../../repositories/db';
import { ensurePromptAlbum } from '@beike/server-kit/assetOrganization';
import type { PerImageResult } from '@beike/domain/assetDeconstruct/prompts';

export async function persistFullPromptRecords(params: {
  perImageResults: PerImageResult[];
  imageUrls: string[];
  albumName: string;
  category: string;
  productCategoryId?: string | null;
  sourceKey?: string;
  sampleImagesJson: string;
  thumbForUrl: (url: string) => Promise<string>;
  defaultCoverUrl: string;
}) {
  const {
    perImageResults, imageUrls, albumName, category, productCategoryId,
    sourceKey, sampleImagesJson, thumbForUrl, defaultCoverUrl,
  } = params;
  let albumId: string | null = null;
  if (sourceKey) {
    const rows = await prisma.$queryRaw<{ albumId: string | null }[]>`SELECT "albumId" FROM "PromptImportSource" WHERE "sourceKey" = ${sourceKey}`;
    albumId = rows[0]?.albumId || null;
  }
  const album = albumId
    ? await prisma.promptAlbum.findUnique({ where: { id: albumId } })
    : await ensurePromptAlbum(prisma, {
        albumName,
        sourceImages: JSON.stringify(imageUrls),
        productCategoryIds: productCategoryId ? JSON.stringify([productCategoryId]) : '[]',
      });
  if (!album) throw new Error('图集不存在');
  if (album.name !== albumName) {
    await prisma.promptAlbum.update({ where: { id: album.id }, data: { name: albumName } });
  }
  const productCategoryIds = JSON.stringify(album.productCategoryId ? [album.productCategoryId] : (productCategoryId ? [productCategoryId] : []));
  const saved: any[] = [];
  for (const img of perImageResults) {
    if (!img || (!img.reverse_prompt_zh && !img.reverse_prompt)) continue;
    const imgIndex = img.image_index || 1;
    const fullPromptZh = (img.reverse_prompt_zh || img.reverse_prompt || '').trim();
    const fullTitle = (img.title || `${albumName}_图#${imgIndex}`).trim();
    const rawImgCover = (imgIndex >= 1 && imgIndex <= imageUrls.length) ? imageUrls[imgIndex - 1] : defaultCoverUrl;
    const compactImgCover = await thumbForUrl(rawImgCover);
    const existing = await prisma.fullPromptAsset.findFirst({
      where: { albumId: album.id, sourceImageIndex: imgIndex },
    });
    const shared = {
      title: fullTitle,
      albumName,
      albumId: album.id,
      reversePromptZh: fullPromptZh,
      sourceImageIndex: imgIndex,
      coverUrl: compactImgCover || existing?.coverUrl || defaultCoverUrl,
      sourceImages: sampleImagesJson,
      category,
      productCategoryIds,
      provenance: 'deconstructed' as const,
    };
    if (existing) {
      saved.push(await prisma.fullPromptAsset.update({
        where: { id: existing.id },
        data: {
          ...shared,
          usageCount: existing.usageCount,
          isFavorite: existing.isFavorite,
        },
      }));
    } else {
      saved.push(await prisma.fullPromptAsset.create({ data: shared }));
    }
  }
  return { album, fullPrompts: saved };
}
