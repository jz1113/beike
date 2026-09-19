import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { desktopMigrations, migrateDatabase } from '../database/migrations';
import { prisma } from '../prisma';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

describe('desktop database upgrades', () => {
  let dir: string;
  let db: PrismaClient;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'beike-upgrade-'));
    db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, 'test.db')}` } } });
    await db.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  });
  afterEach(async () => {
    await db.$disconnect();
    await rm(dir, { recursive: true, force: true });
  });

  it('upgrades an old assistant table, preserves WAL data and runs once', async () => {
    await db.$executeRawUnsafe('CREATE TABLE "AssistantThread" (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL DEFAULT \'新对话\', messagesJson TEXT NOT NULL DEFAULT \'[]\', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    await db.$executeRawUnsafe('INSERT INTO "AssistantThread" (id, title) VALUES (?, ?)', 'old', '保留对话');
    const result = await migrateDatabase(db);
    expect(await db.assistantThread.findUnique({ where: { id: 'old' } })).toMatchObject({ title: '保留对话', allowedToolsJson: '[]' });
    expect((await migrateDatabase(db)).backupPath).toBeNull();
    const backup = new PrismaClient({ datasources: { db: { url: `file:${result.backupPath}` } } });
    try {
      expect(await backup.$queryRawUnsafe('SELECT title FROM "AssistantThread"')).toEqual([{ title: '保留对话' }]);
      const columns = await backup.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("AssistantThread")');
      expect(columns.some(column => column.name === 'allowedToolsJson')).toBe(false);
    } finally { await backup.$disconnect(); }
  });

  it('rolls back DDL and version records on failure, then can retry', async () => {
    await expect(migrateDatabase(db, [...desktopMigrations, {
      version: 'test_failure', checksum: 'test', apply: async tx => {
        await tx.$executeRawUnsafe('CREATE TABLE "PartialWrite" (id TEXT)');
        throw new Error('simulated interruption');
      },
    }])).rejects.toThrow('simulated interruption');
    expect(await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE name IN ('PartialWrite', '_BeikeMigration', 'AssistantThread')")).toEqual([]);
    await migrateDatabase(db);
    expect(await db.assistantThread.count()).toBe(0);
  });

  it('blocks downgrades and unexpected schema drift', async () => {
    await migrateDatabase(db);
    await expect(migrateDatabase(db, [])).rejects.toThrow('version mismatch');
    await db.$executeRawUnsafe('ALTER TABLE "AssistantThread" DROP COLUMN "allowedToolsJson"');
    await expect(migrateDatabase(db)).rejects.toThrow('AssistantThread.allowedToolsJson');
  });

  it('refuses to fabricate missing required historical data', async () => {
    await db.$executeRawUnsafe('CREATE TABLE "Product" (id TEXT PRIMARY KEY NOT NULL)');
    await db.$executeRawUnsafe("INSERT INTO Product VALUES ('retained')");
    await expect(migrateDatabase(db)).rejects.toThrow('Product.platform');
    expect(await db.$queryRawUnsafe('SELECT id FROM Product')).toEqual([{ id: 'retained' }]);
  });

  it('matches the Prisma-created schema for every application table', async () => {
    await migrateDatabase(db);
    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 1) <> '_'");
    expect(tables.length).toBeGreaterThan(10);
    for (const { name } of tables) {
      if (!/^\w+$/.test(name)) throw new Error('Unexpected test table');
      const columns = `PRAGMA table_info("${name}")`;
      expect(await db.$queryRawUnsafe(columns)).toEqual(await prisma.$queryRawUnsafe(columns));
      const indexes = `SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = '${name}' ORDER BY name`;
      expect(await db.$queryRawUnsafe(indexes)).toEqual(await prisma.$queryRawUnsafe(indexes));
    }
  });

  it('uses the ordered index for deep library pages', async () => {
    await migrateDatabase(db);
    const plan = await db.$queryRawUnsafe<Array<{ detail: string }>>('EXPLAIN QUERY PLAN SELECT id FROM FullPromptAsset ORDER BY isFavorite DESC, usageCount DESC, createdAt DESC, id DESC LIMIT 100 OFFSET 49900');
    expect(plan.some(row => row.detail.includes('FullPromptAsset_library_order_idx'))).toBe(true);
    expect(plan.some(row => row.detail.includes('TEMP B-TREE'))).toBe(false);
  });

  it('does not modify the schema if the backup directory cannot be created', async () => {
    await writeFile(path.join(dir, 'database-backups'), 'occupied');
    await expect(migrateDatabase(db)).rejects.toThrow();
    expect(await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE name = '_BeikeMigration'")).toEqual([]);
  });

  it('recovers after the migration process is killed before commit', async () => {
    const runner = path.join(dir, 'interrupted.mts');
    const migrationModule = pathToFileURL(path.resolve('packages/server-kit/src/database/migrations.ts')).href;
    await writeFile(runner, `
      import { createRequire } from 'node:module';
      import { migrateDatabase, desktopMigrations } from ${JSON.stringify(migrationModule)};
      const require = createRequire(${JSON.stringify(path.resolve('package.json'))});
      const { PrismaClient } = require('@prisma/client');
      const db = new PrismaClient({ datasources: { db: { url: ${JSON.stringify(`file:${path.join(dir, 'test.db')}`)} } } });
      await migrateDatabase(db, [...desktopMigrations, {
        version: 'interrupted', checksum: 'test', apply: async tx => {
          await tx.$executeRawUnsafe('CREATE TABLE Interrupted (id TEXT)');
          process.stdout.write('MIGRATION_READY');
          await new Promise(() => {});
        }
      }]);
    `);
    const child = spawn(process.execPath, ['--import', pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href, runner], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Migration child did not start')), 10_000);
        let output = '';
        child.stdout.on('data', chunk => {
          output += String(chunk);
          if (output.includes('MIGRATION_READY')) { clearTimeout(timer); resolve(); }
        });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', () => { clearTimeout(timer); reject(new Error('Migration child exited early')); });
      });
    } finally {
      const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    }
    expect(await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE name IN ('Interrupted', '_BeikeMigration')")).toEqual([]);
    await migrateDatabase(db);
    expect(await db.assistantThread.count()).toBe(0);
  }, 20_000);
});
