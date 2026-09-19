import { expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { desktopMigrations, migrateDatabase } from '../database/migrations';
import { albumSourceKey } from '../database/assetOrganization';
it('groups only proven sources, backs up first, preserves every row, and is idempotent', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'asset-migration-'));
  const db = new PrismaClient({datasources:{db:{url:`file:${path.join(dir,'test.db')}`}}});
  try {
    await migrateDatabase(db, desktopMigrations.filter(m => m.version < '20260915_01_asset_organization'));
    for (const [id,name,images,index] of [['a','same','["x","y"]',1],['b','same','["y","x"]',2],['c','same','["other"]',1],['d','same',null,1],['e','same',null,1]] as const) {
      await db.$executeRawUnsafe('INSERT INTO FullPromptAsset (id,title,albumName,reversePromptZh,sourceImages,sourceImageIndex,usageCount,isFavorite,updatedAt) VALUES (?,?,?,?,?,?,9,true,?)',id,name,name,'preserve',images,index,new Date().toISOString());
    }
    const result = await migrateDatabase(db);
    const preview = JSON.parse(await readFile(`${result.backupPath}.groups.json`,'utf8'));
    expect(preview.albums).toHaveLength(4);
    const rows = await db.fullPromptAsset.findMany({orderBy:{id:'asc'}});
    expect(rows).toHaveLength(5);expect(rows[0].albumId).toBe(rows[1].albumId);
    expect(rows.every(r=>r.usageCount===9 && r.isFavorite && r.reversePromptZh==='preserve' && r.productCategoryIds==='["jewelry"]')).toBe(true);
    expect((await migrateDatabase(db)).backupPath).toBeNull();
    const backup = new PrismaClient({datasources:{db:{url:`file:${result.backupPath}`}}});
    try { expect((await backup.$queryRawUnsafe<Array<{n:number}>>('SELECT COUNT(*) AS n FROM FullPromptAsset'))[0].n).toBe(5n); } finally { await backup.$disconnect(); }
  } finally { await db.$disconnect(); await rm(dir,{recursive:true,force:true}); }
});
it('keeps source signatures stable across image order while isolating missing evidence', () => {
  expect(albumSourceKey('a',['x','y'],'1')).toBe(albumSourceKey('a',['y','x'],'2'));
  expect(albumSourceKey('a',null,'1')).not.toBe(albumSourceKey('a',null,'2'));
});
