import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_MASTER_RECIPES } from '@shared/domain/prompts/masterRecipes';
import { unscopedPrisma as prisma } from './prisma';
import { OFFICIAL_WORKSPACE_ID } from '../workspace/workspaceContext';

type JsonRecord = Record<string, unknown>;

interface PromptAssetSeedData {
  fullPrompts?: JsonRecord[];
  scenes?: JsonRecord[];
  outfits?: JsonRecord[];
  actions?: JsonRecord[];
  personas?: JsonRecord[];
  albums?: JsonRecord[];
  productCategories?: JsonRecord[];
}

interface PromptAssetSeedFile {
  data?: PromptAssetSeedData;
}

function loadPromptAssetSeed(): PromptAssetSeedData {
  const seedPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../shared/domain/seeds/promptAssets.json',
  );
  if (!fs.existsSync(seedPath)) return {};
  const parsed = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as PromptAssetSeedFile;
  return parsed.data || {};
}

/**
 * A deliberate database reset must survive an API restart.  The marker lives
 * beside the SQLite database rather than in it, so a successful reset leaves
 * no application record behind merely to say that it was reset.
 */
function catalogResetMarkerPath(): string | null {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl?.startsWith('file:')) return null;

  let databasePath = databaseUrl.slice('file:'.length);
  if (databasePath.startsWith('//')) databasePath = databasePath.slice(2);
  if (!path.isAbsolute(databasePath)) databasePath = path.resolve(process.cwd(), databasePath);
  return `${databasePath}.catalog-reset`;
}

export function suppressOfficialCatalogSeedAfterReset(): boolean {
  const markerPath = catalogResetMarkerPath();
  if (!markerPath) {
    throw new Error('当前数据库不是本地 SQLite 文件，无法持久化清空状态');
  }
  if (fs.existsSync(markerPath)) return false;
  fs.writeFileSync(markerPath, 'The user explicitly cleared all local database data.\n', 'utf8');
  return true;
}

export function resumeOfficialCatalogSeedAfterFailedReset(): void {
  const markerPath = catalogResetMarkerPath();
  if (markerPath) fs.rmSync(markerPath, { force: true });
}

function isOfficialCatalogSeedSuppressed(): boolean {
  const markerPath = catalogResetMarkerPath();
  return Boolean(markerPath && fs.existsSync(markerPath));
}

const BOOL_KEYS = new Set(['isFavorite', 'hasHuman', 'isUniversal']);
const INT_KEYS = new Set([
  'sourceImageIndex',
  'usageCount',
  'shotOrder',
  'productFrameRatio',
  'position',
]);

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false' || value == null) return false;
  return fallback;
}

function asInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function pickRow(row: JsonRecord, keys: string[]): JsonRecord {
  const out: JsonRecord = { workspaceId: OFFICIAL_WORKSPACE_ID };
  for (const key of keys) {
    if (!(key in row) || row[key] === undefined) continue;
    if (BOOL_KEYS.has(key)) out[key] = asBool(row[key]);
    else if (INT_KEYS.has(key)) out[key] = asInt(row[key]);
    else if (key === 'createdAt' || key === 'updatedAt') continue;
    else out[key] = row[key];
  }
  return out;
}

async function insertMissing(
  label: string,
  rows: JsonRecord[],
  listIds: () => Promise<string[]>,
  insert: (row: JsonRecord) => Promise<unknown>,
) {
  if (rows.length === 0) return 0;
  const existing = new Set(await listIds());
  let inserted = 0;
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : '';
    if (id && existing.has(id)) continue;
    try {
      await insert(row);
      inserted += 1;
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
      if (code !== 'P2002') {
        console.warn(`[officialCatalogSeed] ${label} 跳过 ${id}:`, error);
      }
    }
  }
  return inserted;
}

export async function upsertOfficialMasterRecipes(): Promise<{ upserted: number }> {
  let upserted = 0;
  for (const item of OFFICIAL_MASTER_RECIPES) {
    const exists = await prisma.styleRecipe.findUnique({ where: { id: item.id } });

    const data = {
      workspaceId: OFFICIAL_WORKSPACE_ID,
      name: item.name,
      category: item.category,
      tag: item.tag,
      desc: item.desc,
      promptSnippet: item.promptSnippet,
      coverUrl: item.coverUrl,
      sampleImages: item.sampleImages,
      isFavorite: true,
    };

    if (exists) {
      await prisma.styleRecipe.update({ where: { id: exists.id }, data });
    } else {
      await prisma.styleRecipe.create({ data: { id: item.id, ...data } });
    }
    upserted += 1;
  }
  return { upserted };
}

export async function seedOfficialPromptAssets(): Promise<{ inserted: number }> {
  const data = loadPromptAssetSeed();
  let inserted = 0;

  inserted += await insertMissing(
    'productCategory',
    data.productCategories || [],
    async () => (await prisma.assetProductCategory.findMany({ select: { id: true } })).map((r) => r.id),
    (row) => prisma.assetProductCategory.create({
      data: pickRow(row, ['id', 'name', 'parentId', 'position']) as never,
    }),
  );
  inserted += await insertMissing(
    'album',
    data.albums || [],
    async () => (await prisma.promptAlbum.findMany({ select: { id: true } })).map((r) => r.id),
    (row) => prisma.promptAlbum.create({
      data: pickRow(row, ['id', 'name', 'sourceKey', 'productCategoryId']) as never,
    }),
  );
  inserted += await insertMissing(
    'scene',
    data.scenes || [],
    async () => (await prisma.sceneAsset.findMany({ select: { id: true } })).map((r) => r.id),
    (row) => prisma.sceneAsset.create({
      data: pickRow(row, [
        'id', 'title', 'description', 'lighting', 'category', 'spatialType', 'suitableCategories',
        'tags', 'coverUrl', 'sourceImages', 'reversePrompt', 'dimensions', 'sourceImageIndex',
        'imageType', 'provenance', 'usageCount', 'isFavorite', 'albumId', 'productCategoryIds', 'isUniversal',
      ]) as never,
    }),
  );
  inserted += await insertMissing(
    'outfit',
    data.outfits || [],
    async () => (await prisma.outfitAsset.findMany({ select: { id: true } })).map((r) => r.id),
    (row) => prisma.outfitAsset.create({
      data: pickRow(row, [
        'id', 'title', 'top', 'bottom', 'shoes', 'colorPalette', 'category', 'suitableCategories',
        'tags', 'coverUrl', 'sourceImages', 'reversePrompt', 'dimensions', 'sourceImageIndex',
        'imageType', 'provenance', 'usageCount', 'isFavorite', 'albumId', 'productCategoryIds', 'isUniversal',
      ]) as never,
    }),
  );
  inserted += await insertMissing(
    'persona',
    data.personas || [],
    async () => (await prisma.personaAsset.findMany({ select: { id: true } })).map((r) => r.id),
    (row) => prisma.personaAsset.create({
      data: pickRow(row, [
        'id', 'name', 'description', 'tags', 'avatarUrl', 'sourceImages', 'reversePrompt',
        'dimensions', 'sourceImageIndex', 'imageType', 'provenance', 'usageCount', 'isFavorite',
        'albumId', 'productCategoryIds', 'isUniversal',
      ]) as never,
    }),
  );
  inserted += await insertMissing(
    'fullPrompt',
    data.fullPrompts || [],
    async () => (await prisma.fullPromptAsset.findMany({ select: { id: true } })).map((r) => r.id),
    (row) => prisma.fullPromptAsset.create({
      data: pickRow(row, [
        'id', 'title', 'albumName', 'reversePromptZh', 'reversePromptEn', 'dimensions', 'imageType',
        'sourceImageIndex', 'coverUrl', 'sourceImages', 'hasHuman', 'shotFraming', 'productFrameRatio',
        'sceneSummary', 'outfitSummary', 'actionSummary', 'personaSummary', 'tags', 'category',
        'provenance', 'usageCount', 'isFavorite', 'albumId', 'productCategoryIds', 'isUniversal',
      ]) as never,
    }),
  );
  inserted += await insertMissing(
    'action',
    data.actions || [],
    async () => (await prisma.actionAsset.findMany({ select: { id: true } })).map((r) => r.id),
    (row) => prisma.actionAsset.create({
      data: pickRow(row, [
        'id', 'title', 'action', 'shotType', 'spatialType', 'camera', 'suitableAnatomy', 'tags',
        'coverUrl', 'sourceImages', 'reversePrompt', 'dimensions', 'sourceImageIndex', 'imageType',
        'provenance', 'sceneId', 'shotOrder', 'usageCount', 'isFavorite', 'albumId', 'productCategoryIds',
        'isUniversal',
      ]) as never,
    }),
  );

  return { inserted };
}

export async function seedOfficialCatalog(): Promise<void> {
  if (isOfficialCatalogSeedSuppressed()) {
    console.log('→ 本地数据库已由用户清空，跳过官方种子回填');
    return;
  }
  const recipes = await upsertOfficialMasterRecipes();
  const assets = await seedOfficialPromptAssets();
  console.log(`→ 官方种子已同步：拍摄架构 ${recipes.upserted} 条，补齐提示词资产 ${assets.inserted} 条`);
}
