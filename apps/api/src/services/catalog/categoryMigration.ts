import {
  buildCategoryMigrationPreview,
  DEFAULT_SUBCATEGORIES_MAP,
  type ActionCategoryId,
  type SubCategoryDef,
  type LocalCategoryReport,
} from '@beike/domain/productCategory';
import { db } from '../../repositories/access';
import { randomUUID } from 'node:crypto';
import {
  categoryMigrationApplyRequestSchema,
  categoryMigrationPreviewRequestSchema,
} from '@beike/contracts/categoryMigration';

function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export async function previewCategoryMigration(raw: unknown) {
  const body = categoryMigrationPreviewRequestSchema.parse(raw);
  const server = await db.assetProductCategory.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  return buildCategoryMigrationPreview(
    body.local as LocalCategoryReport[],
    server.map((row) => ({
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      aliases: parseJsonArray((row as { aliases?: string }).aliases),
      keywords: parseJsonArray((row as { keywords?: string }).keywords),
      anatomy: parseJsonArray((row as { anatomy?: string }).anatomy),
    })),
  );
}

export async function listServerSubCategories(): Promise<Partial<Record<ActionCategoryId, SubCategoryDef[]>>> {
  const rows = await db.assetProductCategory.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] });
  const map: Partial<Record<ActionCategoryId, SubCategoryDef[]>> = {};
  for (const row of rows) {
    if (!row.parentId) continue;
    const parentId = row.parentId as ActionCategoryId;
    const list = map[parentId] || [];
    list.push({
      id: row.id,
      parentId,
      label: row.name,
      shortLabel: row.name,
      keywords: parseJsonArray((row as { keywords?: string }).keywords),
      anatomy: parseJsonArray((row as { anatomy?: string }).anatomy)[0],
    });
    map[parentId] = list;
  }
  for (const parentId of Object.keys(DEFAULT_SUBCATEGORIES_MAP) as ActionCategoryId[]) {
    if (!map[parentId]?.length) map[parentId] = DEFAULT_SUBCATEGORIES_MAP[parentId];
  }
  return map;
}

export async function applyCategoryMigration(raw: unknown) {
  const body = categoryMigrationApplyRequestSchema.parse(raw);
  const existing = await db.assetProductCategory.findMany();
  const parents = new Map(existing.filter((row) => !row.parentId).map((row) => [row.id, row]));
  for (const item of body.items) {
    if (!parents.has(item.parentId)) {
      const created = await db.assetProductCategory.create({
        data: { id: item.parentId, name: labelOf(item.parentId), parentId: null, position: parents.size },
      });
      parents.set(created.id, created);
    }
    const duplicate = existing.find((row) => row.parentId === item.parentId && row.name === item.label);
    const keywords = JSON.stringify(item.keywords || []);
    const anatomy = JSON.stringify(item.anatomy ? [item.anatomy] : []);
    if (duplicate) {
      await db.$executeRawUnsafe(
        'UPDATE "AssetProductCategory" SET "keywords" = ?, "anatomy" = ? WHERE "id" = ?',
        keywords,
        anatomy,
        duplicate.id,
      ).catch(() => 0);
      continue;
    }
    const id = existing.some((row) => row.id === item.id) ? `cat_${randomUUID().replace(/-/g, '').slice(0, 12)}` : item.id;
    await db.assetProductCategory.create({
      data: {
        id,
        name: item.label,
        parentId: item.parentId,
        position: existing.filter((row) => row.parentId === item.parentId).length,
      },
    });
    await db.$executeRawUnsafe(
      'UPDATE "AssetProductCategory" SET "keywords" = ?, "anatomy" = ? WHERE "id" = ?',
      keywords,
      anatomy,
      id,
    ).catch(() => 0);
    existing.push({ id, name: item.label, parentId: item.parentId, position: 0 } as typeof existing[number]);
  }
  return listServerSubCategories();
}

function labelOf(id: string) {
  const labels: Record<string, string> = {
    jewelry: '珠宝首饰',
    digital_3c: '手机数码',
    apparel: '服饰穿搭',
    bag: '箱包',
    shoes: '鞋靴',
    beauty: '美妆',
    eyewear: '眼镜',
    universal: '通用日常',
  };
  return labels[id] || id;
}
