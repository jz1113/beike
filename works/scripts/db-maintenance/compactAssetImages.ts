import { PrismaClient } from '@prisma/client';
import { createCompactThumbnailDataUrl, createCompactSourceImagesJson } from '@beike/server-kit/imageConverter';

async function compactDatabase(dbPath: string) {
  console.log(`[compactAssetImages] Starting database compaction for ${dbPath}...`);
  process.env.DATABASE_URL = `file:${dbPath}`;
  const prisma = new PrismaClient({
    datasources: {
      db: { url: `file:${dbPath}` },
    },
  });

  try {
    // 1. SceneAsset
    const scenes = await prisma.sceneAsset.findMany();
    console.log(`Checking ${scenes.length} SceneAssets...`);
    let sceneUpdated = 0;
    for (const sc of scenes) {
      let needsUpdate = false;
      let newCoverUrl = sc.coverUrl;
      let newSourceImages = sc.sourceImages;

      if (sc.coverUrl && sc.coverUrl.length > 30000) {
        newCoverUrl = await createCompactThumbnailDataUrl(sc.coverUrl, 320);
        needsUpdate = true;
      }
      if (sc.sourceImages && sc.sourceImages.length > 50000) {
        newSourceImages = await createCompactSourceImagesJson(sc.sourceImages, 320);
        needsUpdate = true;
      }

      if (needsUpdate) {
        await prisma.sceneAsset.update({
          where: { id: sc.id },
          data: { coverUrl: newCoverUrl, sourceImages: newSourceImages },
        });
        sceneUpdated++;
      }
    }
    console.log(`Updated ${sceneUpdated} SceneAssets.`);

    // 2. OutfitAsset
    const outfits = await prisma.outfitAsset.findMany();
    console.log(`Checking ${outfits.length} OutfitAssets...`);
    let outfitUpdated = 0;
    for (const ot of outfits) {
      let needsUpdate = false;
      let newCoverUrl = ot.coverUrl;
      let newSourceImages = ot.sourceImages;

      if (ot.coverUrl && ot.coverUrl.length > 30000) {
        newCoverUrl = await createCompactThumbnailDataUrl(ot.coverUrl, 320);
        needsUpdate = true;
      }
      if (ot.sourceImages && ot.sourceImages.length > 50000) {
        newSourceImages = await createCompactSourceImagesJson(ot.sourceImages, 320);
        needsUpdate = true;
      }

      if (needsUpdate) {
        await prisma.outfitAsset.update({
          where: { id: ot.id },
          data: { coverUrl: newCoverUrl, sourceImages: newSourceImages },
        });
        outfitUpdated++;
      }
    }
    console.log(`Updated ${outfitUpdated} OutfitAssets.`);

    // 3. ActionAsset
    const actions = await prisma.actionAsset.findMany();
    console.log(`Checking ${actions.length} ActionAssets...`);
    let actionUpdated = 0;
    for (const act of actions) {
      let needsUpdate = false;
      let newCoverUrl = act.coverUrl;
      let newSourceImages = act.sourceImages;

      if (act.coverUrl && act.coverUrl.length > 30000) {
        newCoverUrl = await createCompactThumbnailDataUrl(act.coverUrl, 320);
        needsUpdate = true;
      }
      if (act.sourceImages && act.sourceImages.length > 50000) {
        newSourceImages = await createCompactSourceImagesJson(act.sourceImages, 320);
        needsUpdate = true;
      }

      if (needsUpdate) {
        await prisma.actionAsset.update({
          where: { id: act.id },
          data: { coverUrl: newCoverUrl, sourceImages: newSourceImages },
        });
        actionUpdated++;
      }
    }
    console.log(`Updated ${actionUpdated} ActionAssets.`);

    // 4. PersonaAsset
    const personas = await prisma.personaAsset.findMany();
    console.log(`Checking ${personas.length} PersonaAssets...`);
    let personaUpdated = 0;
    for (const p of personas) {
      let needsUpdate = false;
      let newAvatarUrl = p.avatarUrl;
      let newSourceImages = p.sourceImages;

      if (p.avatarUrl && p.avatarUrl.length > 30000) {
        newAvatarUrl = await createCompactThumbnailDataUrl(p.avatarUrl, 320);
        needsUpdate = true;
      }
      if (p.sourceImages && p.sourceImages.length > 50000) {
        newSourceImages = await createCompactSourceImagesJson(p.sourceImages, 320);
        needsUpdate = true;
      }

      if (needsUpdate) {
        await prisma.personaAsset.update({
          where: { id: p.id },
          data: { avatarUrl: newAvatarUrl, sourceImages: newSourceImages },
        });
        personaUpdated++;
      }
    }
    console.log(`Updated ${personaUpdated} PersonaAssets.`);

    // 5. Run SQLite vacuum
    await prisma.$executeRawUnsafe('VACUUM;');
    console.log(`[compactAssetImages] Compaction and VACUUM completed for ${dbPath}!`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const os = await import('os');
  const path = await import('path');
  const fs = await import('fs');

  const devDb = path.resolve(process.cwd(), 'db/prisma/dev.db');
  const desktopDb = path.join(os.homedir(), 'Library/Application Support/com.azhuo.workbench/azhuo.db');

  if (fs.existsSync(devDb)) {
    await compactDatabase(devDb);
  }
  if (fs.existsSync(desktopDb)) {
    await compactDatabase(desktopDb);
  }
}

main().catch(console.error);
