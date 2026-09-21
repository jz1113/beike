import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../repositories/db';
import {
  workshopBatchSchema,
  workshopBatchStatusSchema,
  type WorkshopBatch,
  type WorkshopBatchStatus,
} from '@beike/contracts/workshopBatches';
import { workshopSnapshotSchema, type WorkshopSnapshot } from '@beike/contracts/workshopWorkspace';

type BatchRow = {
  id: string;
  name: string;
  status: string;
  revision: number;
  snapshotJson: string;
  createdAt: string;
  updatedAt: string;
  legacyRecovered: number;
};

type StateRow = { activeBatchId: string | null; legacyMigratedAt: string | null };
export class WorkshopBatchConflict extends Error {}
export class WorkshopBatchNotFound extends Error {}

const DEFAULT_SETTINGS: WorkshopSnapshot['settings'] = {
  selectedVisionModel: 'gemini-3.7-flash',
  selectedImageGenModel: 'gpt-image-2',
  selectedArchId: 'recipe_jewelry_master',
  hasHumanPersona: true,
  selectedQuality: 'high',
  selectedAspect: '3:4',
  selectedShotCount: 4,
  useAssetLibrary: true,
  lockedPersonaId: '',
  lockedSceneId: '',
  lockedOutfitId: '',
  lockedActionId: '',
  generationStrategy: 'grid_first',
  autoGenerateCopywriting: true,
};

function emptySnapshot(): WorkshopSnapshot {
  return { version: 1, mode: 'original', currentStage: 1, batchInputText: '', items: [], settings: DEFAULT_SETTINGS };
}

function statusForSnapshot(snapshot: WorkshopSnapshot): WorkshopBatchStatus {
  if (snapshot.items.length === 0) return 'draft';
  if (snapshot.currentStage === 1) return 'collecting';
  if (snapshot.currentStage === 2 || snapshot.currentStage === 3) return 'review';
  return 'generating';
}

function makeId() {
  return `batch_${randomUUID().replace(/-/g, '')}`;
}

function parseRow(row: BatchRow): WorkshopBatch {
  return workshopBatchSchema.parse({
    ...row,
    status: workshopBatchStatusSchema.parse(row.status),
    snapshot: workshopSnapshotSchema.parse(JSON.parse(row.snapshotJson)),
    legacyRecovered: Boolean(row.legacyRecovered),
  });
}

function summarize(batch: WorkshopBatch) {
  return {
    id: batch.id,
    name: batch.name,
    status: batch.status,
    revision: batch.revision,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    legacyRecovered: batch.legacyRecovered,
    itemCount: batch.snapshot.items.length,
    readyCount: batch.snapshot.items.filter(item => item.status === 'success' && item.selected).length,
    taskCount: batch.snapshot.items.reduce((sum, item) => sum + item.tasks.length, 0),
  };
}

export function createWorkshopBatchRepository(db: PrismaClient) {
  const insert = async (id: string, name: string, status: WorkshopBatchStatus, snapshot: WorkshopSnapshot, legacyRecovered = false) => {
    const now = new Date().toISOString();
    await db.$executeRaw`
      INSERT INTO "WorkshopBatch" ("id", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered")
      VALUES (${id}, ${name}, ${status}, 1, ${JSON.stringify(workshopSnapshotSchema.parse(snapshot))}, ${now}, ${now}, ${legacyRecovered ? 1 : 0})
    `;
    return parseRow((await db.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" WHERE "id" = ${id}`)[0]);
  };

  const initialize = async () => db.$transaction(async tx => {
    const states = await tx.$queryRaw<StateRow[]>`SELECT "activeBatchId", "legacyMigratedAt" FROM "WorkshopBatchState" WHERE "id" = 'original'`;
    const state = states[0];
    if (state?.activeBatchId) {
      const activeRows = await tx.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" WHERE "id" = ${state.activeBatchId}`;
      if (activeRows[0]) return parseRow(activeRows[0]);
    }

    const now = new Date().toISOString();
    const activeId = makeId();
    if (!state?.legacyMigratedAt) {
      const legacyRows = await tx.$queryRaw<Array<{ snapshotJson: string }>>`SELECT "snapshotJson" FROM "WorkshopWorkspace" WHERE "id" = 'original'`;
      if (legacyRows[0]) {
        const legacySnapshot = workshopSnapshotSchema.safeParse(JSON.parse(legacyRows[0].snapshotJson));
        if (legacySnapshot.success && legacySnapshot.data.items.length > 0) {
          const legacyId = makeId();
          await tx.$executeRaw`
            INSERT INTO "WorkshopBatch" ("id", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered")
            VALUES (${legacyId}, '恢复的历史批次', 'archived', 1, ${JSON.stringify(legacySnapshot.data)}, ${now}, ${now}, 1)
          `;
        }
      }
    }
    const snapshot = emptySnapshot();
    await tx.$executeRaw`
      INSERT INTO "WorkshopBatch" ("id", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered")
      VALUES (${activeId}, '未命名新批次', 'draft', 1, ${JSON.stringify(snapshot)}, ${now}, ${now}, 0)
    `;
    await tx.$executeRaw`
      INSERT INTO "WorkshopBatchState" ("id", "activeBatchId", "legacyMigratedAt") VALUES ('original', ${activeId}, ${now})
      ON CONFLICT("id") DO UPDATE SET "activeBatchId" = excluded."activeBatchId", "legacyMigratedAt" = COALESCE("WorkshopBatchState"."legacyMigratedAt", excluded."legacyMigratedAt")
    `;
    return parseRow((await tx.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" WHERE "id" = ${activeId}`)[0]);
  });

  return {
    async getActive() { return initialize(); },
    async list() {
      const active = await initialize();
      const rows = await db.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" ORDER BY "updatedAt" DESC`;
      // Empty abandoned drafts have no work or output to recover, so they do not
      // clutter the user's history. The currently active blank batch is always visible.
      return rows.map(parseRow).map(summarize).filter(batch => batch.id === active.id || batch.itemCount > 0 || batch.status === 'archived');
    },
    async get(id: string) {
      await initialize();
      const rows = await db.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" WHERE "id" = ${id}`;
      if (!rows[0]) throw new WorkshopBatchNotFound();
      return parseRow(rows[0]);
    },
    async create(name?: string) {
      const active = await initialize();
      if (active.status === 'draft' && active.snapshot.items.length === 0 && !name) return active;
      const batch = await insert(makeId(), name || '未命名新批次', 'draft', emptySnapshot());
      await db.$executeRaw`UPDATE "WorkshopBatchState" SET "activeBatchId" = ${batch.id} WHERE "id" = 'original'`;
      return batch;
    },
    async duplicate(id: string) {
      const source = await this.get(id);
      const snapshot = { ...source.snapshot, currentStage: 1, batchInputText: '' };
      const batch = await insert(makeId(), `${source.name}（副本）`, 'draft', snapshot);
      await db.$executeRaw`UPDATE "WorkshopBatchState" SET "activeBatchId" = ${batch.id} WHERE "id" = 'original'`;
      return batch;
    },
    async archiveActive() {
      const active = await initialize();
      const now = new Date().toISOString();
      await db.$executeRaw`UPDATE "WorkshopBatch" SET "status" = 'archived', "updatedAt" = ${now} WHERE "id" = ${active.id}`;
      return this.create('未命名新批次');
    },
    async clearHistory() {
      const active = await initialize();
      const deleted = await db.$executeRaw`DELETE FROM "WorkshopBatch" WHERE "id" <> ${active.id}`;
      return { deleted };
    },
    async rename(id: string, name: string) {
      await this.get(id);
      const updatedAt = new Date().toISOString();
      await db.$executeRaw`UPDATE "WorkshopBatch" SET "name" = ${name}, "updatedAt" = ${updatedAt} WHERE "id" = ${id}`;
      return this.get(id);
    },
    async write(id: string, revision: number, snapshot: WorkshopSnapshot) {
      workshopSnapshotSchema.parse(snapshot);
      const current = await this.get(id);
      if (current.status === 'archived') throw new WorkshopBatchConflict('历史批次为只读内容，请复制为新批次后再编辑');
      const now = new Date().toISOString();
      const status = statusForSnapshot(snapshot);
      const changed = await db.$executeRaw`
        UPDATE "WorkshopBatch"
        SET "revision" = "revision" + 1, "status" = ${status}, "snapshotJson" = ${JSON.stringify(snapshot)}, "updatedAt" = ${now}
        WHERE "id" = ${id} AND "revision" = ${revision}
      `;
      if (changed !== 1) throw new WorkshopBatchConflict('当前批次已在其他窗口更新，请重新加载后继续');
      return { revision: revision + 1, updatedAt: now };
    },
  };
}
