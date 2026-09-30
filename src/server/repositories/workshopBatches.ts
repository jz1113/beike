import { requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from './access';
import {
  workshopBatchStatusSchema,
  type WorkshopBatchStatus,
} from '@shared/contracts/workshopBatches';
import { emptyPipelineState, workshopSnapshotSchema, workshopBatchSchema, type WorkshopSnapshot, type WorkshopBatch } from '@shared/workshopSnapshot';
import { statusToViewStage } from '@shared/domain/workshop/workshopPipeline';
import { stageForSnapshotContent, statusForSnapshot } from '@shared/domain/workshop/snapshotContent';

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
type BatchConnection = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;
export class WorkshopBatchConflict extends Error {}
export class WorkshopBatchNotFound extends Error {}

const DEFAULT_SETTINGS: WorkshopSnapshot['settings'] = {
  selectedVisionModel: 'gemini-3.7-flash',
  selectedImageGenModel: 'gpt-image-2',
  selectedArchId: 'auto',
  hasHumanPersona: true,
  selectedQuality: 'high',
  selectedAspect: '3:4',
  selectedShotCount: 4,
  useAssetLibrary: true,
  lockedPersonaId: 'auto',
  lockedSceneId: 'auto',
  lockedOutfitId: 'auto',
  lockedActionId: 'auto',
  lockedFullPromptId: 'auto',
  promptGroupFolderId: 'auto',
  generationStrategy: 'grid_first',
  autoGenerateCopywriting: true,
  personaMode: 'asset_driven',
};

function emptySnapshot(): WorkshopSnapshot {
  return {
    version: 2,
    mode: 'original',
    currentStage: 1,
    batchInputText: '',
    items: [],
    settings: DEFAULT_SETTINGS,
    pipeline: emptyPipelineState('draft'),
  };
}

function hasBatchContent(snapshot: WorkshopSnapshot) {
  return snapshot.items.length > 0 || snapshot.batchInputText.trim().length > 0;
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
  const insert = async (connection: BatchConnection, id: string, name: string, status: WorkshopBatchStatus, snapshot: WorkshopSnapshot, legacyRecovered = false) => {
    const now = new Date().toISOString();
    await connection.$executeRaw`
      INSERT INTO "WorkshopBatch" ("id", "workspaceId", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered")
      VALUES (${id}, ${requireWorkspaceId()}, ${name}, ${status}, 1, ${JSON.stringify(workshopSnapshotSchema.parse(snapshot))}, ${now}, ${now}, ${legacyRecovered ? 1 : 0})
    `;
    return parseRow((await connection.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${id}`)[0]);
  };

  const initialize = async () => db.$transaction(async tx => {
    const states = await tx.$queryRaw<StateRow[]>`SELECT "activeBatchId", "legacyMigratedAt" FROM "WorkshopBatchState" WHERE "workspaceId" = ${requireWorkspaceId()}`;
    const state = states[0];
    if (state?.activeBatchId) {
      const activeRows = await tx.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${state.activeBatchId}`;
      if (activeRows[0]) {
        const active = parseRow(activeRows[0]);
        if (active.status !== 'archived') return active;
      }
    }

    const now = new Date().toISOString();
    const activeId = makeId();
    if (!state?.legacyMigratedAt) {
      const legacyRows = await tx.$queryRaw<Array<{ snapshotJson: string }>>`SELECT "snapshotJson" FROM "WorkshopWorkspace" WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = 'original'`;
      if (legacyRows[0]) {
        const legacySnapshot = workshopSnapshotSchema.safeParse(JSON.parse(legacyRows[0].snapshotJson));
        if (legacySnapshot.success && hasBatchContent(legacySnapshot.data)) {
          const legacyId = makeId();
          await tx.$executeRaw`
            INSERT INTO "WorkshopBatch" ("id", "workspaceId", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered")
            VALUES (${legacyId}, ${requireWorkspaceId()}, '恢复的历史批次', 'archived', 1, ${JSON.stringify(legacySnapshot.data)}, ${now}, ${now}, 1)
          `;
        }
      }
    }
    const snapshot = emptySnapshot();
    await tx.$executeRaw`
      INSERT INTO "WorkshopBatch" ("id", "workspaceId", "name", "status", "revision", "snapshotJson", "createdAt", "updatedAt", "legacyRecovered")
      VALUES (${activeId}, ${requireWorkspaceId()}, '未命名新批次', 'draft', 1, ${JSON.stringify(snapshot)}, ${now}, ${now}, 0)
    `;
    await tx.$executeRaw`
      INSERT INTO "WorkshopBatchState" ("id", "workspaceId", "activeBatchId", "legacyMigratedAt") VALUES (${requireWorkspaceId()}, ${requireWorkspaceId()}, ${activeId}, ${now})
      ON CONFLICT("workspaceId") DO UPDATE SET "activeBatchId" = excluded."activeBatchId", "legacyMigratedAt" = COALESCE("WorkshopBatchState"."legacyMigratedAt", excluded."legacyMigratedAt")
    `;
    return parseRow((await tx.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${activeId}`)[0]);
  });

  const retireActive = async (connection: BatchConnection, active: WorkshopBatch, forceArchive = false) => {
    if (!forceArchive && active.status === 'draft' && !hasBatchContent(active.snapshot)) {
      const rows = await connection.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "WorkshopBatch"
        WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${active.id} AND "revision" = ${active.revision} AND "status" <> 'archived'
          AND "id" = (SELECT "activeBatchId" FROM "WorkshopBatchState" WHERE "workspaceId" = ${requireWorkspaceId()})`;
      if (rows.length !== 1) throw new WorkshopBatchConflict('当前批次已在其他窗口更新或切换，请重新加载后再新建');
      return;
    }
    const now = new Date().toISOString();
    const snapshot: WorkshopSnapshot = {
      ...active.snapshot,
      currentStage: statusToViewStage('archived'),
      pipeline: { ...active.snapshot.pipeline, status: 'archived' },
    };
    const changed = await connection.$executeRaw`
      UPDATE "WorkshopBatch"
      SET "revision" = "revision" + 1, "status" = 'archived', "snapshotJson" = ${JSON.stringify(snapshot)}, "updatedAt" = ${now}
      WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${active.id} AND "revision" = ${active.revision} AND "status" <> 'archived'
        AND "id" = (SELECT "activeBatchId" FROM "WorkshopBatchState" WHERE "workspaceId" = ${requireWorkspaceId()})
    `;
    if (changed !== 1) throw new WorkshopBatchConflict('当前批次已在其他窗口更新或切换，请重新加载后再归档');
  };

  const replaceActive = (active: WorkshopBatch, name: string, snapshot: WorkshopSnapshot, forceArchive = false) => db.$transaction(async tx => {
    await retireActive(tx, active, forceArchive);
    const batch = await insert(tx, makeId(), name, 'draft', snapshot);
    const changed = await tx.$executeRaw`UPDATE "WorkshopBatchState" SET "activeBatchId" = ${batch.id}
      WHERE "workspaceId" = ${requireWorkspaceId()} AND "activeBatchId" = ${active.id}`;
    if (changed !== 1) throw new WorkshopBatchConflict('当前批次已在其他窗口切换，请重新加载后继续');
    return batch;
  });

  return {
    async getActive() { return initialize(); },
    async list() {
      const active = await initialize();
      const rows = await db.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" WHERE "workspaceId" = ${requireWorkspaceId()} ORDER BY "updatedAt" DESC`;
      // Empty abandoned drafts have no work or output to recover, so they do not
      // clutter the user's history. The currently active blank batch is always visible.
      return rows.map(parseRow).map(summarize).filter(batch => batch.id === active.id || batch.itemCount > 0 || batch.status === 'archived');
    },
    async get(id: string) {
      await initialize();
      const rows = await db.$queryRaw<BatchRow[]>`SELECT * FROM "WorkshopBatch" WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${id}`;
      if (!rows[0]) throw new WorkshopBatchNotFound();
      return parseRow(rows[0]);
    },
    async create(name?: string) {
      const active = await initialize();
      if (active.status === 'draft' && !hasBatchContent(active.snapshot) && !name) return active;
      return replaceActive(active, name || '未命名新批次', emptySnapshot());
    },
    async duplicate(id: string) {
      const requestedSource = await this.get(id);
      const active = await initialize();
      const source = requestedSource.id === active.id ? active : requestedSource;
      const snapshot: WorkshopSnapshot = {
        ...source.snapshot,
        currentStage: stageForSnapshotContent(source.snapshot),
        batchInputText: '',
        pipeline: emptyPipelineState('draft'),
      };
      return replaceActive(active, `${source.name}（副本）`, snapshot);
    },
    async archiveActive(options: { force?: boolean } = {}) {
      const active = await initialize();
      const completable = active.status === 'completed' || active.status === 'cancelled';
      if (!completable && !options.force) {
        throw new WorkshopBatchConflict('请先完成本批次，或确认放弃后再归档');
      }
      return replaceActive(active, '未命名新批次', emptySnapshot(), true);
    },
    async clearHistory() {
      const active = await initialize();
      const workspaceId = requireWorkspaceId();
      return db.$transaction(async (tx) => {
        const states = await tx.$queryRaw<StateRow[]>`SELECT "activeBatchId", "legacyMigratedAt" FROM "WorkshopBatchState" WHERE "workspaceId" = ${workspaceId}`;
        if (states[0]?.activeBatchId !== active.id) throw new WorkshopBatchConflict('当前批次已在其他窗口切换，请刷新后再清空历史');
        await tx.$executeRaw`DELETE FROM "WorkshopOutputReview" WHERE "workspaceId" = ${workspaceId} AND "batchId" <> ${active.id}`;
        await tx.$executeRaw`DELETE FROM "WorkshopPipelineRun" WHERE "workspaceId" = ${workspaceId} AND "batchId" <> ${active.id}`;
        // Recipe tombstones and library rotation events share this table, but
        // only events attached to the removed history batches belong here.
        await tx.$executeRaw`DELETE FROM "PromptAssetUsageEvent" WHERE "workspaceId" = ${workspaceId}
          AND "batchId" IN (SELECT "id" FROM "WorkshopBatch" WHERE "workspaceId" = ${workspaceId} AND "id" <> ${active.id})`;
        const deleted = await tx.$executeRaw`DELETE FROM "WorkshopBatch" WHERE "workspaceId" = ${workspaceId} AND "id" <> ${active.id}`;
        return { deleted };
      });
    },
    async deleteHistory(id: string) {
      const workspaceId = requireWorkspaceId();
      return db.$transaction(async (tx) => {
        const states = await tx.$queryRaw<StateRow[]>`SELECT "activeBatchId", "legacyMigratedAt" FROM "WorkshopBatchState" WHERE "workspaceId" = ${workspaceId}`;
        if (states[0]?.activeBatchId === id) throw new WorkshopBatchConflict('当前批次不能在历史记录中删除');
        const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "WorkshopBatch" WHERE "workspaceId" = ${workspaceId} AND "id" = ${id}`;
        if (!rows.length) throw new WorkshopBatchNotFound();
        await tx.$executeRaw`DELETE FROM "WorkshopOutputReview" WHERE "workspaceId" = ${workspaceId} AND "batchId" = ${id}`;
        await tx.$executeRaw`DELETE FROM "WorkshopPipelineRun" WHERE "workspaceId" = ${workspaceId} AND "batchId" = ${id}`;
        await tx.$executeRaw`DELETE FROM "PromptAssetUsageEvent" WHERE "workspaceId" = ${workspaceId} AND "batchId" = ${id}`;
        const deleted = await tx.$executeRaw`DELETE FROM "WorkshopBatch" WHERE "workspaceId" = ${workspaceId} AND "id" = ${id}`;
        return { deleted };
      });
    },
    async rename(id: string, name: string) {
      await this.get(id);
      const updatedAt = new Date().toISOString();
      await db.$executeRaw`UPDATE "WorkshopBatch" SET "name" = ${name}, "updatedAt" = ${updatedAt} WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${id}`;
      return this.get(id);
    },
    async write(id: string, revision: number, snapshot: WorkshopSnapshot) {
      workshopSnapshotSchema.parse(snapshot);
      const active = await initialize();
      if (active.id !== id) throw new WorkshopBatchConflict('只能保存当前活跃批次，历史批次请复制为新批次后再编辑');
      const current = await this.get(id);
      if (current.status === 'archived') throw new WorkshopBatchConflict('历史批次为只读内容，请复制为新批次后再编辑');
      const now = new Date().toISOString();
      const status = statusForSnapshot(snapshot);
      const changed = await db.$executeRaw`
        UPDATE "WorkshopBatch"
        SET "revision" = "revision" + 1, "status" = ${status}, "snapshotJson" = ${JSON.stringify(snapshot)}, "updatedAt" = ${now}
        WHERE "workspaceId" = ${requireWorkspaceId()} AND "id" = ${id} AND "revision" = ${revision} AND "status" <> 'archived'
          AND "id" = (SELECT "activeBatchId" FROM "WorkshopBatchState" WHERE "workspaceId" = ${requireWorkspaceId()})
      `;
      if (changed !== 1) throw new WorkshopBatchConflict('当前批次已在其他窗口更新，请重新加载后继续');
      return { revision: revision + 1, updatedAt: now };
    },
  };
}
