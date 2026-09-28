import { Prisma, type PrismaClient } from '@prisma/client';
import { OFFICIAL_WORKSPACE_ID, requireWorkspaceId } from './workspaceContext';

const SHARED_READ_MODELS = new Set([
  'StyleRecipe',
  'SceneAsset',
  'OutfitAsset',
  'ActionAsset',
  'PersonaAsset',
  'FullPromptAsset',
  'AssetProductCategory',
  'PromptAlbum',
]);

type QueryObject = Record<string, unknown>;

function andWhere(where: unknown, extra: QueryObject): QueryObject {
  return where && typeof where === 'object' ? { AND: [where, extra] } : extra;
}

// Unique selectors must stay at the top level, including compound selectors.
// Add permission checks to the original operation instead of probing through a
// separate client: query(args) preserves interactive AND array transactions.
function scopedUniqueWhere(where: unknown, extra: QueryObject): QueryObject {
  const source = (where || {}) as QueryObject;
  return { ...source, AND: [...(Array.isArray(source.AND) ? source.AND : source.AND ? [source.AND] : []), extra] };
}

function readFilter(model: string, workspaceId: string): Record<string, unknown> {
  if (SHARED_READ_MODELS.has(model)) {
    return { workspaceId: { in: [workspaceId, OFFICIAL_WORKSPACE_ID] } };
  }
  return { workspaceId };
}

function writeFilter(workspaceId: string): Record<string, unknown> {
  return { workspaceId };
}

function withWorkspaceData(data: unknown, workspaceId: string): unknown {
  if (Array.isArray(data)) return data.map((item) => withWorkspaceData(item, workspaceId));
  if (!data || typeof data !== 'object') return data;
  const source = data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source, workspaceId };
  for (const [key, value] of Object.entries(out)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const nested = value as Record<string, unknown>;
    if ('create' in nested) {
      out[key] = { ...nested, create: withWorkspaceData(nested.create, workspaceId) };
    } else if ('createMany' in nested && nested.createMany && typeof nested.createMany === 'object') {
      const createMany = nested.createMany as Record<string, unknown>;
      out[key] = { ...nested, createMany: { ...createMany, data: withWorkspaceData(createMany.data, workspaceId) } };
    }
  }
  return out;
}

const relations = new Map(Prisma.dmmf.datamodel.models.map(model => [
  model.name, model.fields.filter(field => field.kind === 'object'),
]));

/** Prisma does not run model query extensions for nested include/select reads. */
function scopeReadSelections(model: string, args: QueryObject, workspaceId: string): void {
  const fields = relations.get(model) || [];
  for (const key of ['include', 'select']) {
    const source = args[key];
    if (!source || typeof source !== 'object') continue;
    const selection = { ...source } as QueryObject;
    args[key] = selection;
    for (const field of fields) {
      const value = selection[field.name];
      if (!value) continue;
      const nested: QueryObject = value === true ? {} : { ...value as QueryObject };
      if (field.isList || !field.isRequired) {
        nested.where = andWhere(nested.where, readFilter(field.type, workspaceId));
      }
      scopeReadSelections(field.type, nested, workspaceId);
      selection[field.name] = nested;
    }
    if (selection._count) {
      const count = selection._count as { select?: QueryObject } | true;
      const selected = count === true
        ? Object.fromEntries(fields.filter(field => field.isList).map(field => [field.name, true]))
        : { ...count.select };
      for (const field of fields.filter(field => field.isList)) {
        if (!selected[field.name]) continue;
        const value = selected[field.name];
        const nested = value === true ? {} : value as QueryObject;
        selected[field.name] = { ...nested, where: andWhere(nested.where, readFilter(field.type, workspaceId)) };
      }
      selection._count = { select: selected };
    }
  }
}

export function extendPrismaWithWorkspace(client: PrismaClient): PrismaClient {
  const extended = client.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const workspaceId = requireWorkspaceId();
          const scoped = args as QueryObject;
          scopeReadSelections(model, scoped, workspaceId);
          switch (operation) {
            case 'findUnique':
            case 'findUniqueOrThrow':
              scoped.where = scopedUniqueWhere(scoped.where, readFilter(model, workspaceId));
              break;
            case 'findFirst':
            case 'findFirstOrThrow':
            case 'findMany':
            case 'count':
            case 'aggregate':
            case 'groupBy':
              scoped.where = andWhere(scoped.where, readFilter(model, workspaceId));
              break;
            case 'create':
            case 'createMany':
            case 'createManyAndReturn':
              scoped.data = withWorkspaceData(scoped.data, workspaceId);
              break;
            case 'update':
            case 'delete':
              scoped.where = scopedUniqueWhere(scoped.where, writeFilter(workspaceId));
              if (scoped.data) scoped.data = withWorkspaceData(scoped.data, workspaceId);
              break;
            case 'upsert':
              scoped.where = scopedUniqueWhere(scoped.where, writeFilter(workspaceId));
              scoped.create = withWorkspaceData(scoped.create, workspaceId);
              scoped.update = withWorkspaceData(scoped.update, workspaceId);
              break;
            case 'updateMany':
            case 'deleteMany':
              scoped.where = andWhere(scoped.where, writeFilter(workspaceId));
              if (scoped.data) scoped.data = withWorkspaceData(scoped.data, workspaceId);
              break;
            default:
              throw new Error(`未隔离的 Prisma 操作: ${model}.${operation}`);
          }
          return query(args);
        },
      },
    },
  });
  return extended as unknown as PrismaClient;
}
