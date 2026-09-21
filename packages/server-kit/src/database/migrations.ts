import { workshopWorkspaceSql } from './workshopWorkspace';
import { workshopBatchesSql } from './workshopBatches';
import { promptImportSourceSql } from './promptImportSource';
import { deconstructReviewSql } from './deconstructReview';
import { organizationSql, applyAssetOrganization, previewAssetOrganization } from './assetOrganization';
import type { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { baselineSql } from './baseline';
import { libraryIndexSql } from './libraryIndexes';

type Database = Prisma.TransactionClient;
interface Column { name: string }
interface Applied { version: string; checksum: string }
export interface DatabaseMigration {
  version: string;
  checksum: string;
  /** Checksums written by an earlier, shipped form of an additive migration. */
  compatibleChecksums?: readonly string[];
  apply: (db: Database) => Promise<void>;
}

const statements = baselineSql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
const contentPromptGroupSql = `
ALTER TABLE "FullPromptAsset" ADD COLUMN "sourceImageIndices" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "groupIndex" INTEGER;
ALTER TABLE "FullPromptAsset" ADD COLUMN "contentSummary" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "architectureSummary" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "replaceableSlots" TEXT;
ALTER TABLE "FullPromptAsset" ADD COLUMN "shotPromptsJson" TEXT;
CREATE INDEX IF NOT EXISTS "FullPromptAsset_album_group_idx" ON "FullPromptAsset"("albumId", "groupIndex");
`;
const tables = statements.filter(s => s.startsWith('CREATE TABLE')).map(sql => {
  const name = /^CREATE TABLE "(\w+)"/.exec(sql)![1];
  const columns = sql.split('\n').flatMap(line => {
    const match = /^\s+"(\w+)" (.+?)(?:,)?$/.exec(line);
    return match ? [{ name: match[1], definition: match[2] }] : [];
  });
  return { name, columns, sql };
});

async function applyBaseline(db: Database): Promise<void> {
  for (const table of tables) {
    const existing = await db.$queryRawUnsafe<Column[]>(`PRAGMA table_info("${table.name}")`);
    if (existing.length === 0) {
      await db.$executeRawUnsafe(table.sql);
      continue;
    }
    for (const column of table.columns) {
      if (existing.some(field => field.name === column.name)) continue;
      // Never invent required historical values or rebuild a user's populated table.
      if (/PRIMARY KEY|UNIQUE|CURRENT_TIMESTAMP/.test(column.definition)
        || (/NOT NULL/.test(column.definition) && !/DEFAULT /.test(column.definition))) {
        throw new Error(`Database upgrade requires an explicit migration for ${table.name}.${column.name}`);
      }
      await db.$executeRawUnsafe(`ALTER TABLE "${table.name}" ADD COLUMN "${column.name}" ${column.definition}`);
    }
  }
  for (const sql of statements.filter(s => /^CREATE (UNIQUE )?INDEX/.test(s))) {
    await db.$executeRawUnsafe(sql.replace('INDEX ', 'INDEX IF NOT EXISTS '));
  }
}

/**
 * 旧版每张图都是一张「完整提示词」卡。保留原记录作历史回溯，同时按连续四图生成
 * 新图组卡并把旧卡标记为 legacy_single；不会删除用户资产。
 */
async function backfillLegacyContentGroups(db: Database): Promise<void> {
  const rows = await db.$queryRawUnsafe<Array<{
    id: string; albumId: string | null; albumName: string | null; title: string;
    reversePromptZh: string; sourceImageIndex: number | null; coverUrl: string | null;
    sourceImages: string | null; category: string; productCategoryIds: string;
    hasHuman: boolean; isFavorite: boolean;
  }>>(`SELECT "id", "albumId", "albumName", "title", "reversePromptZh", "sourceImageIndex", "coverUrl", "sourceImages", "category", "productCategoryIds", "hasHuman", "isFavorite"
       FROM "FullPromptAsset" WHERE "groupIndex" IS NULL AND "provenance" <> 'legacy_single'
       ORDER BY "albumId", "sourceImageIndex", "createdAt"`);
  const buckets = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.albumId || !row.sourceImageIndex) continue;
    const groupIndex = Math.floor((row.sourceImageIndex - 1) / 4) + 1;
    const key = `${row.albumId}:${groupIndex}`;
    buckets.set(key, [...(buckets.get(key) || []), row]);
  }
  for (const [key, group] of buckets) {
    const first = group[0];
    const groupIndex = Math.floor(((first.sourceImageIndex || 1) - 1) / 4) + 1;
    const indexList = group.map(row => row.sourceImageIndex!).sort((a, b) => a - b);
    const exists = await db.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "FullPromptAsset" WHERE "albumId" = ? AND "groupIndex" = ?', first.albumId, groupIndex,
    );
    if (exists.length === 0) {
      const architecture = group.map((row, index) => `图${index + 1}（原图#${row.sourceImageIndex}）：沿用历史反推中的构图与动作关系`).join('\n');
      const contentSummary = `${first.albumName || first.title}：由历史单图母本回填的连续内容图组。`;
      const shots = group.map((row, index) => ({
        shot_no: index + 1, title: row.title || `图组分镜 ${index + 1}`, prompt: row.reversePromptZh,
        has_human: row.hasHuman, shot_type: row.hasHuman ? 'model_shot' : 'pure_product', selected: true,
      }));
      await db.$executeRawUnsafe(
        `INSERT INTO "FullPromptAsset" ("id", "title", "albumName", "reversePromptZh", "sourceImageIndex", "sourceImageIndices", "groupIndex", "contentSummary", "architectureSummary", "replaceableSlots", "shotPromptsJson", "coverUrl", "sourceImages", "hasHuman", "personaSummary", "category", "provenance", "isFavorite", "createdAt", "updatedAt", "albumId", "productCategoryIds", "isUniversal")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'legacy_group', ?, ?, ?, ?, ?, 0)`,
        `legacy_group_${randomUUID()}`,
        `${first.albumName || first.title} · 图组 ${groupIndex}`,
        first.albumName,
        [
          `【整条内容总结】${contentSummary}`,
          `【固定图组架构】${architecture}`,
          '【图组分镜提示词】',
          ...group.map((row, index) => `图${index + 1}（原图#${row.sourceImageIndex}）：\n${row.reversePromptZh}`),
        ].join('\n\n'),
        first.sourceImageIndex,
        JSON.stringify(indexList), groupIndex, contentSummary, architecture,
        JSON.stringify({ persona: 'group_replaceable', outfit: 'group_replaceable', scene: 'group_replaceable', locked: ['scene_continuity', 'shot_order', 'framing', 'action_or_placement'] }),
        JSON.stringify(shots), first.coverUrl, first.sourceImages, group.some(row => row.hasHuman),
        group.some(row => row.hasHuman) ? '历史图组有人物；人物与穿搭请按整组替换' : '本组无人物',
        first.category, group.some(row => row.isFavorite), new Date().toISOString(), new Date().toISOString(), first.albumId, first.productCategoryIds,
      );
    }
    await db.$executeRawUnsafe(
      `UPDATE "FullPromptAsset" SET "provenance" = 'legacy_single' WHERE "id" IN (${group.map(() => '?').join(', ')})`,
      ...group.map(row => row.id),
    );
    void key;
  }
}

export const desktopMigrations: readonly DatabaseMigration[] = [{
  version: '20260913_01_desktop_baseline',
  checksum: createHash('sha256').update(baselineSql).digest('hex'),
  apply: applyBaseline,
}, {
  version: '20260913_02_library_order_indexes',
  checksum: createHash('sha256').update(libraryIndexSql).digest('hex'),
  apply: async db => {
    for (const sql of libraryIndexSql.split(';').map(s => s.trim()).filter(Boolean)) {
      await db.$executeRawUnsafe(sql);
    }
  },
}, {
  version: '20260915_01_asset_organization',
  checksum: createHash('sha256').update(organizationSql + 'source-grouping-v1').digest('hex'),
  apply: applyAssetOrganization,
}, {
  version: '20260915_02_deconstruct_review',
  checksum: createHash('sha256').update(deconstructReviewSql).digest('hex'),
  apply: async db => { await db.$executeRawUnsafe(deconstructReviewSql); },
}, {
  version: '20260916_01_prompt_import_sources',
  checksum: createHash('sha256').update(promptImportSourceSql).digest('hex'),
  apply: async db => { await db.$executeRawUnsafe(promptImportSourceSql); },
}, {
  version: '20260916_02_workshop_workspace',
  checksum: createHash('sha256').update(workshopWorkspaceSql).digest('hex'),
  apply: async db => { await db.$executeRawUnsafe(workshopWorkspaceSql); },
}, {
  version: '20260921_01_workshop_batches',
  checksum: createHash('sha256').update(workshopBatchesSql).digest('hex'),
  apply: async db => {
    for (const sql of workshopBatchesSql.split(';').map(s => s.trim()).filter(Boolean)) {
      await db.$executeRawUnsafe(sql);
    }
  },
}, {
  version: '20260921_02_content_prompt_groups',
  checksum: createHash('sha256').update(contentPromptGroupSql).digest('hex'),
  // The desktop build that first introduced this migration wrote this checksum
  // before shotPromptsJson was added. Keep it recognizable so the follow-up
  // repair below can finish those local databases rather than refusing startup.
  compatibleChecksums: ['e8c0ef1abaac4c4d6155e1fdeea6a2345ab6745bfc5b1791ffccfe08e6fafe8e'],
  apply: async db => {
    for (const statement of contentPromptGroupSql.split(';').map(s => s.trim()).filter(Boolean)) {
      const alter = /^ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/.exec(statement);
      if (alter) {
        const columns = await db.$queryRawUnsafe<Column[]>(`PRAGMA table_info("${alter[1]}")`);
        if (columns.some(column => column.name === alter[2])) continue;
      }
      await db.$executeRawUnsafe(statement);
    }
    await backfillLegacyContentGroups(db);
  },
}, {
  // Do not alter the checksum of the already-applied migration above. This
  // idempotent follow-up completes databases created by its earlier form.
  version: '20260921_03_content_prompt_groups_repair',
  checksum: createHash('sha256').update('content-prompt-groups-repair-v1').digest('hex'),
  apply: async db => {
    for (const statement of contentPromptGroupSql.split(';').map(s => s.trim()).filter(Boolean)) {
      const alter = /^ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/.exec(statement);
      if (alter) {
        const columns = await db.$queryRawUnsafe<Column[]>(`PRAGMA table_info("${alter[1]}")`);
        if (columns.some(column => column.name === alter[2])) continue;
      }
      await db.$executeRawUnsafe(statement);
    }
    await backfillLegacyContentGroups(db);
  },
}];

async function readApplied(db: Database): Promise<Applied[]> {
  const table = await db.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_BeikeMigration'",
  );
  return table.length ? db.$queryRawUnsafe<Applied[]>('SELECT version, checksum FROM "_BeikeMigration"') : [];
}

function pendingMigrations(applied: Applied[], migrations: readonly DatabaseMigration[]): DatabaseMigration[] {
  for (const record of applied) {
    const migration = migrations.find(item => item.version === record.version);
    if (!migration || (migration.checksum !== record.checksum && !migration.compatibleChecksums?.includes(record.checksum))) {
      throw new Error(`Database migration version mismatch: ${record.version}; use the matching application version`);
    }
  }
  return migrations.filter(item => !applied.some(record => record.version === item.version));
}

async function verifyBaseline(db: Database): Promise<void> {
  for (const table of tables) {
    const info = await db.$queryRawUnsafe<Column[]>(`PRAGMA table_info("${table.name}")`);
    for (const column of table.columns) {
      if (!info.some(field => field.name === column.name)) {
        throw new Error(`Database schema is incomplete: ${table.name}.${column.name}`);
      }
    }
  }
  const violations = await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check');
  if (violations.length) throw new Error('Database has broken foreign key references; restore or repair before startup');
}

/** Runs before HTTP listen. VACUUM INTO includes committed WAL data in one consistent backup. */
export async function migrateDatabase(
  db: PrismaClient,
  migrations: readonly DatabaseMigration[] = desktopMigrations,
): Promise<{ backupPath: string | null }> {
  const pending = pendingMigrations(await readApplied(db), migrations);
  let backupPath: string | null = null;
  if (pending.length) {
    const databases = await db.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list');
    const file = databases.find(database => database.name === 'main')?.file;
    if (!file) throw new Error('Database upgrade requires a file-backed SQLite database for backup');
    const directory = path.join(path.dirname(file), 'database-backups');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    backupPath = path.join(directory, `before-${pending[0].version}-${randomUUID()}.db`);
    await db.$executeRawUnsafe('VACUUM INTO ?', backupPath);
    await chmod(backupPath, 0o600);
    const backup = await open(backupPath, 'r+');
    try { await backup.sync(); } finally { await backup.close(); }
    if (pending.some(m => m.version === '20260915_01_asset_organization')) {
      const exists = await db.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name='FullPromptAsset'");
      if (exists.length) await writeFile(`${backupPath}.groups.json`, JSON.stringify(await previewAssetOrganization(db), null, 2), { mode: 0o600 });
    }
    // DDL and version records commit together. SQLite rolls both back on failure or process exit.
    try { await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS "_BeikeMigration" (version TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, appliedAt TEXT NOT NULL)');
      // Recheck under the write lock when two processes start together.
      for (const migration of pendingMigrations(await readApplied(tx), migrations)) {
        await migration.apply(tx);
        await tx.$executeRawUnsafe('INSERT INTO "_BeikeMigration" (version, checksum, appliedAt) VALUES (?, ?, ?)', migration.version, migration.checksum, new Date().toISOString());
      }
      await verifyBaseline(tx);
    }, { maxWait: 10_000, timeout: 120_000 });
    } catch (error) {
      throw new Error(`Database upgrade rolled back; backup: ${backupPath}. ${error instanceof Error ? error.message : 'Migration failed'}`, { cause: error });
    }
  } else {
    await verifyBaseline(db);
  }
  return { backupPath };
}
