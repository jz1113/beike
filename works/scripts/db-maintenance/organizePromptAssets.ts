/** DATABASE_URL=file:/absolute/path.db node --import tsx .../organizePromptAssets.ts [--apply]
 * Preview is read-only. Apply writes a consistent SQLite backup + grouping report first.
 * To roll back: stop the API, preserve the current DB, and restore the printed backup as
 * DATABASE_URL's file (including removal of stale -wal/-shm only while the API is stopped).
 */
import { prisma } from '@beike/server-kit/prisma';
import { migrateDatabase } from '@beike/server-kit/database/migrations';
import { previewAssetOrganization } from '@beike/server-kit/database/assetOrganization';
try {
  if (process.argv.includes('--apply')) {
    const result = await migrateDatabase(prisma);
    console.log(JSON.stringify({ ...result, fullPrompts: await prisma.fullPromptAsset.count(), albums: await prisma.promptAlbum.count(), categories: await prisma.assetProductCategory.findMany() }, null, 2));
  } else {
    const preview = await previewAssetOrganization(prisma);
    console.log(JSON.stringify({ ...preview, albumCount: preview.albums.length }, null, 2));
  }
} finally { await prisma.$disconnect(); }
