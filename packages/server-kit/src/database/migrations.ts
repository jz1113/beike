import { workshopWorkspaceSql } from './workshopWorkspace';
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
  apply: (db: Database) => Promise<void>;
}

const statements = baselineSql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
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
    if (!migration || migration.checksum !== record.checksum) {
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
