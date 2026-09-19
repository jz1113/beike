import { prisma } from './db';

type ReviewRow = { id: string; albumName: string; payload: string; status: string; createdAt: string };

export const deconstructReviews = {
  listByStatus: (status: string) =>
    prisma.$queryRaw<ReviewRow[]>`SELECT * FROM "DeconstructReview" WHERE "status" = ${status} ORDER BY "createdAt" DESC`,
  getById: (id: string) =>
    prisma.$queryRaw<ReviewRow[]>`SELECT * FROM "DeconstructReview" WHERE "id" = ${id}`,
  updateStatus: (id: string, from: string, to: string) =>
    prisma.$executeRaw`UPDATE "DeconstructReview" SET "status" = ${to} WHERE "id" = ${id} AND "status" = ${from}`,
};

export const promptImportSources = {
  markApproved: (sourceKey: string, albumId: string | null) =>
    prisma.$executeRaw`UPDATE "PromptImportSource" SET "state" = 'approved', "albumId" = ${albumId}, "updatedAt" = ${new Date().toISOString()} WHERE "sourceKey" = ${sourceKey}`,
};

export const fullPromptAssets = {
  findAlbumIdByName: (albumName: string) =>
    prisma.fullPromptAsset.findFirst({ where: { albumName }, select: { albumId: true } }),
};
