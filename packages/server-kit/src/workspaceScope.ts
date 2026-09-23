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

function camelModel(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function andWhere(where: unknown, extra: Record<string, unknown>): Record<string, unknown> {
  if (!where || typeof where !== 'object') return extra;
  return { AND: [where, extra] };
}

function scopedFindFirstWhere(where: unknown, workspaceId: string): Record<string, unknown> {
  const unique = where && typeof where === 'object'
    ? (where as Record<string, unknown>).workspaceId_sourceKey
    : undefined;
  // Prisma's compound unique selector is valid in findUnique/upsert, but not
  // findFirst. The workspace extension probes upserts with findFirst first.
  const filter = unique && typeof unique === 'object' ? unique : where;
  return andWhere(filter, writeFilter(workspaceId));
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


function uniqueWhere(model: string, workspaceId: string, existing: { id?: string; sourceKey?: string }): Record<string, unknown> {
  if (model === 'PromptImportSource') {
    return { workspaceId_sourceKey: { workspaceId, sourceKey: existing.sourceKey } };
  }
  return { id: existing.id };
}

function notFound(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('No record was found for an update.', {
    code: 'P2025',
    clientVersion: Prisma.prismaVersion.client,
  });
}

function isReadable(model: string, rowWorkspaceId: unknown, workspaceId: string): boolean {
  if (rowWorkspaceId === workspaceId) return true;
  return SHARED_READ_MODELS.has(model) && rowWorkspaceId === OFFICIAL_WORKSPACE_ID;
}

export function extendPrismaWithWorkspace(client: PrismaClient): PrismaClient {
  const unscoped = client as unknown as Record<string, { findFirst: (args: unknown) => Promise<{ id: string } | null>; create: (args: unknown) => Promise<unknown> }>;
  const extended = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const workspaceId = requireWorkspaceId();
          const delegate = unscoped[camelModel(model)];
          switch (operation) {
            case 'findUnique':
            case 'findUniqueOrThrow': {
              const row = await query(args) as { workspaceId?: string } | null;
              if (!row) return row;
              if (isReadable(model, row.workspaceId, workspaceId)) return row;
              if (operation === 'findUniqueOrThrow') throw notFound();
              return null;
            }
            case 'findFirst':
            case 'findFirstOrThrow':
            case 'findMany':
            case 'count':
            case 'aggregate':
            case 'groupBy':
              (args as { where?: unknown }).where = andWhere((args as { where?: unknown }).where, readFilter(model, workspaceId));
              return query(args);
            case 'create':
              (args as { data: unknown }).data = withWorkspaceData((args as { data: unknown }).data, workspaceId);
              return query(args);
            case 'createMany':
            case 'createManyAndReturn':
              (args as { data: unknown }).data = withWorkspaceData((args as { data: unknown }).data, workspaceId);
              return query(args);
            case 'update':
            case 'delete': {
              const existing = await delegate.findFirst({
                where: scopedFindFirstWhere((args as { where?: unknown }).where, workspaceId),
                select: model === 'PromptImportSource' ? { sourceKey: true } : { id: true },
              }) as { id?: string; sourceKey?: string } | null;
              if (!existing) throw notFound();
              (args as { where: unknown }).where = uniqueWhere(model, workspaceId, existing);
              if (operation === 'update' && (args as { data?: unknown }).data) {
                (args as { data: unknown }).data = withWorkspaceData((args as { data: unknown }).data, workspaceId);
              }
              return query(args);
            }
            case 'upsert': {
              const typed = args as { where?: unknown; create: Record<string, unknown>; update: Record<string, unknown>; include?: unknown; select?: unknown };
              const existing = await delegate.findFirst({
                where: scopedFindFirstWhere(typed.where, workspaceId),
                select: model === 'PromptImportSource' ? { sourceKey: true } : { id: true },
              }) as { id?: string; sourceKey?: string } | null;
              if (!existing) {
                return delegate.create({
                  data: withWorkspaceData(typed.create, workspaceId),
                  include: typed.include,
                  select: typed.select,
                });
              }
              typed.where = uniqueWhere(model, workspaceId, existing) as never;
              typed.update = withWorkspaceData(typed.update, workspaceId) as Record<string, unknown>;
              return query(args);
            }
            case 'updateMany':
            case 'deleteMany':
              (args as { where?: unknown }).where = andWhere((args as { where?: unknown }).where, writeFilter(workspaceId));
              if ((args as { data?: unknown }).data) {
                (args as { data: unknown }).data = withWorkspaceData((args as { data: unknown }).data, workspaceId);
              }
              return query(args);
            default:
              throw new Error(`未隔离的 Prisma 操作: ${model}.${operation}`);
          }
        },
      },
    },
  });
  return extended as unknown as PrismaClient;
}
