import type { Prisma } from '@prisma/client';
import { LEGACY_WORKSPACE_ID, LOCAL_WORKSPACE_ID, OFFICIAL_WORKSPACE_ID } from '../workspace/workspaceContext';
import { FULL_PROMPT_GROUP_VISIBILITY_SQL } from './fullPromptGroupVisibility';
import { migrateFullPromptNumberSnapshots } from './fullPromptNumberSnapshots';

type Database = Pick<Prisma.TransactionClient, '$executeRawUnsafe' | '$queryRawUnsafe'>;
interface LibraryNumber { assetId: string; displayNumber: number; legacyDisplayNumber: number | null }

export const workspaceFullPromptNumbersMigrationSource = 'workspace-full-prompt-library-numbers-v1';
const tableSql = `CREATE TABLE IF NOT EXISTS "FullPromptLibraryNumber" (
  "workspaceId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "displayNumber" INTEGER NOT NULL,
  "legacyDisplayNumber" INTEGER,
  PRIMARY KEY ("workspaceId", "assetId")
)`;

/** Explicit owner/shared filtering is required because raw queries bypass Prisma workspace scoping. */
export async function ensureWorkspaceFullPromptNumbers(
  db: Database, workspaceId: string, backfill = false,
): Promise<void> {
  const sequenceId = `library:${workspaceId}`;
  // Obtain the SQLite write lock before reading the cursor; concurrent imports cannot reuse numbers.
  await db.$executeRawUnsafe('INSERT OR IGNORE INTO "FullPromptDisplaySequence" ("id", "lastNumber") VALUES (?, 0)', sequenceId);
  const cursor = await db.$queryRawUnsafe<Array<{ lastNumber: number }>>(`SELECT MAX(
    (SELECT "lastNumber" FROM "FullPromptDisplaySequence" WHERE "id" = ?),
    COALESCE((SELECT MAX("displayNumber") FROM "FullPromptLibraryNumber" WHERE "workspaceId" = ?), 0)
  ) AS "lastNumber"`, sequenceId, workspaceId);
  const start = Number(cursor[0]?.lastNumber || 0);
  const order = backfill
    ? '"isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC'
    : '"createdAt" ASC, "id" ASC';
  await db.$executeRawUnsafe(`INSERT INTO "FullPromptLibraryNumber"
    ("workspaceId", "assetId", "displayNumber", "legacyDisplayNumber")
    SELECT ?, "id", ROW_NUMBER() OVER (ORDER BY ${order}) + ?, "displayNumber"
    FROM "FullPromptAsset"
    WHERE "workspaceId" IN (?, ?) AND ${FULL_PROMPT_GROUP_VISIBILITY_SQL}
      AND NOT EXISTS (SELECT 1 FROM "FullPromptLibraryNumber" AS n
        WHERE n."workspaceId" = ? AND n."assetId" = "FullPromptAsset"."id")`,
  workspaceId, start, workspaceId, OFFICIAL_WORKSPACE_ID, workspaceId);
  await db.$executeRawUnsafe(`UPDATE "FullPromptDisplaySequence" SET "lastNumber" = MAX(
    "lastNumber", COALESCE((SELECT MAX("displayNumber") FROM "FullPromptLibraryNumber" WHERE "workspaceId" = ?), 0)
  ) WHERE "id" = ?`, workspaceId, sequenceId);
}

export async function workspaceHasUnnumberedFullPrompts(db: Database, workspaceId: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "FullPromptAsset"
    WHERE "workspaceId" IN (?, ?) AND ${FULL_PROMPT_GROUP_VISIBILITY_SQL}
      AND NOT EXISTS (SELECT 1 FROM "FullPromptLibraryNumber" AS n
        WHERE n."workspaceId" = ? AND n."assetId" = "FullPromptAsset"."id") LIMIT 1`,
  workspaceId, OFFICIAL_WORKSPACE_ID, workspaceId);
  return rows.length > 0;
}

export async function readWorkspaceFullPromptNumbers(db: Database, workspaceId: string): Promise<LibraryNumber[]> {
  return db.$queryRawUnsafe<LibraryNumber[]>(`SELECT "assetId", "displayNumber", "legacyDisplayNumber"
    FROM "FullPromptLibraryNumber" WHERE "workspaceId" = ?`, workspaceId);
}

export async function applyWorkspaceFullPromptNumbers(db: Database): Promise<void> {
  await db.$executeRawUnsafe(tableSql);
  await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "FullPromptLibraryNumber_workspaceId_displayNumber_key"
    ON "FullPromptLibraryNumber"("workspaceId", "displayNumber")`);
  const workspaces = await db.$queryRawUnsafe<Array<{ workspaceId: string }>>(`SELECT DISTINCT "workspaceId" FROM "FullPromptAsset"
    UNION SELECT DISTINCT "workspaceId" FROM "WorkshopWorkspace"
    UNION SELECT DISTINCT "workspaceId" FROM "WorkshopBatch"
    UNION SELECT DISTINCT "workspaceId" FROM "AssistantTurn"`);
  for (const { workspaceId } of workspaces) {
    await ensureWorkspaceFullPromptNumbers(db, workspaceId, true);
    const numbers = await readWorkspaceFullPromptNumbers(db, workspaceId);
    await migrateFullPromptNumberSnapshots(db, workspaceId, new Map(numbers.map(row => [row.assetId, {
      oldNumber: row.legacyDisplayNumber, newNumber: row.displayNumber,
    }])));
  }
}

/** Local startup adopts historical assets after migrations; reconcile their already-migrated bindings. */
export async function adoptLegacyFullPromptNumbers(db: Database): Promise<void> {
  const legacyNumbers = await readWorkspaceFullPromptNumbers(db, LEGACY_WORKSPACE_ID);
  if (!legacyNumbers.length) return;
  await ensureWorkspaceFullPromptNumbers(db, LOCAL_WORKSPACE_ID, true);
  const localNumbers = new Map((await readWorkspaceFullPromptNumbers(db, LOCAL_WORKSPACE_ID))
    .map(row => [row.assetId, row.displayNumber]));
  const changes = new Map(legacyNumbers.flatMap(row => {
    const newNumber = localNumbers.get(row.assetId);
    return newNumber == null ? [] : [[row.assetId, { oldNumber: row.displayNumber, newNumber }] as const];
  }));
  await migrateFullPromptNumberSnapshots(db, LOCAL_WORKSPACE_ID, changes);
}
