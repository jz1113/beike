#!/usr/bin/env node
/** Run the application's versioned SQLite migrations without starting HTTP. */
import { resolveSqliteFile } from './sqlite-path.mjs';

const { loadApiEnv } = await import('../../../src/server/bootstrap/env.ts');
loadApiEnv();
const databaseFile = resolveSqliteFile(process.argv[2]);
process.env.DATABASE_URL = `file:${databaseFile}`;
const { initializeDatabase, prisma, unscopedPrisma } = await import('../../../src/server/infrastructure/database/prisma.ts');

try {
  await initializeDatabase();
  console.log(`SQLite migrations verified: ${databaseFile}`);
} finally {
  await Promise.all([prisma.$disconnect(), unscopedPrisma.$disconnect()]);
}
