import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { prisma } from './db';

type ReviewRow = { id: string; albumName: string; payload: string; status: string; createdAt: string };

export const deconstructReviews = {
  listByStatus: (status: string) =>
    prisma.$queryRaw<ReviewRow[]>`SELECT * FROM "DeconstructReview" WHERE "workspaceId" = ${requireWorkspaceId()} AND "status" = ${status} ORDER BY "createdAt" DESC`,
  getById: (id: string) =>
    prisma.$queryRaw<ReviewRow[]>`SELECT * FROM "DeconstructReview" WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${id}`,
  updateStatus: (id: string, from: string, to: string) =>
    prisma.$executeRaw`UPDATE "DeconstructReview" SET "status" = ${to} WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${id} AND "status" = ${from}`,
  createPending: (id: string, albumName: string, payload: unknown) =>
    prisma.$executeRaw`INSERT OR IGNORE INTO "DeconstructReview" ("id", "workspaceId", "albumName", "payload", "status", "createdAt") VALUES (${id}, ${requireWorkspaceId()}, ${albumName}, ${JSON.stringify(payload)}, 'pending', ${new Date().toISOString()})`,
};

export const promptImportSources = {
  markApproved: (sourceKey: string, albumId: string | null) =>
    prisma.$executeRaw`UPDATE "PromptImportSource" SET "state" = 'approved', "albumId" = ${albumId}, "updatedAt" = ${new Date().toISOString()} WHERE "workspaceId" = ${requireWorkspaceId()} AND "sourceKey" = ${sourceKey}`,
};

export const fullPromptAssets = {
  findAlbumIdByName: (albumName: string) =>
    prisma.fullPromptAsset.findFirst({ where: { albumName }, select: { albumId: true } }),
};
