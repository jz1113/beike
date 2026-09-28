import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

export const assetTables = ['SceneAsset', 'OutfitAsset', 'ActionAsset', 'PersonaAsset', 'FullPromptAsset'] as const;
export const organizationSql = `
CREATE TABLE "AssetProductCategory" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "parentId" TEXT, "position" INTEGER NOT NULL DEFAULT 0, FOREIGN KEY ("parentId") REFERENCES "AssetProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "AssetProductCategory_parentId_position_idx" ON "AssetProductCategory"("parentId", "position");
CREATE TABLE "PromptAlbum" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "sourceKey" TEXT NOT NULL, "productCategoryId" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("productCategoryId") REFERENCES "AssetProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE UNIQUE INDEX "PromptAlbum_sourceKey_key" ON "PromptAlbum"("sourceKey");
CREATE INDEX "PromptAlbum_productCategoryId_idx" ON "PromptAlbum"("productCategoryId");
${assetTables.map(table => `ALTER TABLE "${table}" ADD COLUMN "albumId" TEXT;
ALTER TABLE "${table}" ADD COLUMN "productCategoryIds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "${table}" ADD COLUMN "isUniversal" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "${table}_albumId_idx" ON "${table}"("albumId");`).join('\n')}
INSERT INTO "AssetProductCategory" ("id", "name", "position") VALUES ('jewelry', '珠宝首饰', 0);
`;
export function albumSourceKey(name: string, raw: unknown, fallback: string): string {
  let sources: string[] = [];
  try { const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) sources = parsed.filter((v): v is string => typeof v === 'string' && !!v.trim());
  } catch { /* Missing evidence must not merge unrelated assets. */ }
  return createHash('sha256').update(JSON.stringify(sources.length && name.trim() ? [name.trim(), [...new Set(sources)].sort()] : ['single', fallback])).digest('hex');
}
export async function previewAssetOrganization(db: Prisma.TransactionClient) {
  const rows = await db.$queryRawUnsafe<Array<{ id: string; albumName: string | null; title: string; sourceImages: string | null }>>('SELECT id, albumName, title, sourceImages FROM "FullPromptAsset" ORDER BY id');
  const groups = new Map<string, { id: string; sourceKey: string; name: string; assetIds: string[] }>();
  for (const row of rows) {
    const key = albumSourceKey(row.albumName || '', row.sourceImages, row.id);
    if (!groups.has(key)) groups.set(key, { id: `album_${key.slice(0,32)}`, sourceKey: key, name: row.albumName || row.title || '未命名图集', assetIds: [] });
    groups.get(key)!.assetIds.push(row.id);
  }
  const counts: Record<string, number> = {};
  for (const table of assetTables) counts[table] = Number((await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM "${table}"`))[0].n);
  return { counts, albums: [...groups.values()] };
}
export async function applyAssetOrganization(db: Prisma.TransactionClient) {
  const preview = await previewAssetOrganization(db);
  const existingTables = await db.$queryRawUnsafe<Array<{ name: string }>>("SELECT name FROM sqlite_master WHERE type='table' AND name='PromptAlbum'");
  const alreadyOrganized = existingTables.length && Number((await db.$queryRawUnsafe<Array<{ n: number }>>('SELECT COUNT(*) AS n FROM PromptAlbum'))[0].n) > 0;
  for (const statement of organizationSql.split(';').map(s => s.trim()).filter(Boolean)) {
    const alter = /^ALTER TABLE "(\w+)" ADD COLUMN "(\w+)"/.exec(statement);
    if (alter) {
      const columns = await db.$queryRawUnsafe<Array<{name: string}>>(`PRAGMA table_info("${alter[1]}")`);
      if (columns.some(c => c.name === alter[2])) continue;
    }
    await db.$executeRawUnsafe(statement.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ').replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ').replace('CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS ').replace('INSERT INTO ', 'INSERT OR IGNORE INTO '));
  }
  // Older desktop launchers used db push and could discard the migration ledger.
  // Adopt a populated organization schema without resetting users' classifications.
  if (!alreadyOrganized) {
    for (const table of assetTables) await db.$executeRawUnsafe(`UPDATE "${table}" SET "productCategoryIds" = '["jewelry"]'`);
    for (const album of preview.albums) {
      await db.$executeRawUnsafe('INSERT INTO "PromptAlbum" (id, name, sourceKey, productCategoryId) VALUES (?, ?, ?, ?)', album.id, album.name, album.sourceKey, 'jewelry');
      for (const id of album.assetIds) await db.$executeRawUnsafe('UPDATE "FullPromptAsset" SET albumId = ? WHERE id = ?', album.id, id);
    }
  }
  for (const table of assetTables) {
    const count = Number((await db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT COUNT(*) AS n FROM "${table}"`))[0].n);
    if (count !== preview.counts[table]) throw new Error(`Asset migration count mismatch: ${table}`);
  }
}
