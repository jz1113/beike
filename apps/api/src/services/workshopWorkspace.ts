import { requireWorkspaceId } from '@beike/server-kit/workspaceContext';
import type { PrismaClient } from '../repositories/access';
import { workshopSnapshotSchema, type WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';

type Row = { revision: number; snapshotJson: string; updatedAt: string };
export class WorkspaceConflict extends Error {}
export function createWorkspaceRepository(db: PrismaClient) {
  return {
    async read(id: string) {
      const rows = await db.$queryRaw<Row[]>`SELECT revision, snapshotJson, updatedAt FROM WorkshopWorkspace WHERE id = ${id} AND workspaceId = ${requireWorkspaceId()}`;
      if (!rows[0]) return { revision: 0, snapshot: null, updatedAt: null };
      return { revision: rows[0].revision, snapshot: workshopSnapshotSchema.parse(JSON.parse(rows[0].snapshotJson)), updatedAt: rows[0].updatedAt };
    },
    async write(id: string, revision: number, snapshot: WorkshopSnapshot) {
      const json = JSON.stringify(workshopSnapshotSchema.parse(snapshot));
      const updatedAt = new Date().toISOString();
      // A single conditional statement prevents a stale window from overwriting a newer draft.
      const changed = revision === 0
        ? await db.$executeRaw`INSERT OR IGNORE INTO WorkshopWorkspace (id, workspaceId, revision, snapshotJson, updatedAt) VALUES (${id}, ${requireWorkspaceId()}, 1, ${json}, ${updatedAt})`
        : await db.$executeRaw`UPDATE WorkshopWorkspace SET revision = revision + 1, snapshotJson = ${json}, updatedAt = ${updatedAt} WHERE id = ${id} AND workspaceId = ${requireWorkspaceId()} AND revision = ${revision}`;
      if (changed !== 1) throw new WorkspaceConflict('工作区已被其他窗口更新，请保留当前内容后重新加载');
      return { revision: revision + 1, updatedAt };
    },
  };
}
