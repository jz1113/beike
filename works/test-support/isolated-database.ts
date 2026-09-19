import { PrismaClient } from '@prisma/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrateDatabase } from '../../packages/server-kit/src/database/migrations';

/** For route tests which scan or delete entire tables; never share the suite database. */
export function isolatedDatabase() {
  const directory = mkdtempSync(path.join(tmpdir(), 'beike-route-test-'));
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, 'test.db')}` } } });
  return {
    prisma,
    initialize: () => migrateDatabase(prisma),
    dispose: async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); },
  };
}
