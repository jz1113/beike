import type { Prisma } from '@prisma/client';

type Database = Prisma.TransactionClient;

export const fullPromptDisplayNumbersMigrationSource = 'full-prompt-display-numbers-v1';

/** Backfill the library's former default order once, without changing assigned numbers. */
export async function applyFullPromptDisplayNumbers(db: Database): Promise<void> {
  const columns = await db.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("FullPromptAsset")');
  if (!columns.some(column => column.name === 'displayNumber')) {
    await db.$executeRawUnsafe('ALTER TABLE "FullPromptAsset" ADD COLUMN "displayNumber" INTEGER');
  }
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FullPromptDisplaySequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastNumber" INTEGER NOT NULL DEFAULT 0
  )`);
  await db.$executeRawUnsafe('INSERT OR IGNORE INTO "FullPromptDisplaySequence" ("id", "lastNumber") VALUES (?, 0)', 'full_prompt');

  const cursor = await db.$queryRawUnsafe<Array<{ lastNumber: number }>>(
    `SELECT MAX(
      (SELECT "lastNumber" FROM "FullPromptDisplaySequence" WHERE "id" = 'full_prompt'),
      COALESCE((SELECT MAX("displayNumber") FROM "FullPromptAsset"), 0)
    ) AS "lastNumber"`,
  );
  const start = Number(cursor[0]?.lastNumber || 0);
  await db.$executeRawUnsafe(`WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (
      ORDER BY "isFavorite" DESC, "usageCount" DESC, "createdAt" DESC, "id" DESC
    ) + ? AS "number"
    FROM "FullPromptAsset"
    WHERE "displayNumber" IS NULL
      AND ("groupIndex" IS NOT NULL OR "provenance" <> 'legacy_single')
  )
  UPDATE "FullPromptAsset"
  SET "displayNumber" = (SELECT "number" FROM numbered WHERE numbered."id" = "FullPromptAsset"."id")
  WHERE "id" IN (SELECT "id" FROM numbered)`, start);
  await db.$executeRawUnsafe(`UPDATE "FullPromptDisplaySequence"
    SET "lastNumber" = MAX("lastNumber", COALESCE((SELECT MAX("displayNumber") FROM "FullPromptAsset"), 0))
    WHERE "id" = 'full_prompt'`);
  await db.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "FullPromptAsset_displayNumber_key" ON "FullPromptAsset"("displayNumber")');
}

/** Call inside the same transaction as the new asset insert. Deleted numbers remain reserved. */
export async function nextFullPromptDisplayNumber(db: Database): Promise<number> {
  await db.$executeRawUnsafe(`INSERT INTO "FullPromptDisplaySequence" ("id", "lastNumber")
    VALUES ('full_prompt', 1)
    ON CONFLICT("id") DO UPDATE SET "lastNumber" = MAX(
      "lastNumber", COALESCE((SELECT MAX("displayNumber") FROM "FullPromptAsset"), 0)
    ) + 1`);
  const rows = await db.$queryRawUnsafe<Array<{ lastNumber: number }>>(
    'SELECT "lastNumber" FROM "FullPromptDisplaySequence" WHERE "id" = ?', 'full_prompt',
  );
  if (!Number.isSafeInteger(rows[0]?.lastNumber) || rows[0].lastNumber < 1) {
    throw new Error('图组展示编号分配失败');
  }
  return rows[0].lastNumber;
}
