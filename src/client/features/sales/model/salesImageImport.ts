import { PERSONA_CATEGORIES, personaImageFields, readPersonaViews, readSceneViews, sceneImageFields, type PersonaCategory } from './salesActionViews';
import { audienceDimensions } from '@shared/domain/assets/appearanceAudience';
import { SCENE_SPACE_LABELS, type SalesSceneSpace } from './salesMaterialCatalog';
import { nextSequentialSalesAssetName, salesAssetNumber } from './salesAssetDraft';

export type SalesImageImportKind = 'persona' | 'scene';
export interface SalesImageImportItem {
  key: string;
  fileKey: string;
  file: File;
  name: string;
  imageUrl?: string;
  status: 'queued' | 'uploading' | 'saving' | 'done' | 'error';
  error?: string;
}
export interface ImportedImageAsset { name: string; dimensions?: string }
export interface SalesImageImportCategory { personaGroup: PersonaCategory; sceneSpace: SalesSceneSpace }
export const MAX_IMAGE_IMPORT_FILES = 50;

export const nextSalesImageImportName = nextSequentialSalesAssetName;

export function addSalesImageImportFiles(kind: SalesImageImportKind, existing: readonly SalesImageImportItem[], files: readonly File[], names: readonly string[]) {
  const items = [...existing];
  const usedNames = [...names, ...items.map((item) => item.name)];
  const errors: string[] = [];
  for (const file of files) {
    const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
    if (items.some((item) => item.fileKey === fileKey)) continue;
    if (!/\.(jpe?g|png|webp|avif|gif)$/i.test(file.name) || (file.type && !['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(file.type))) {
      errors.push(`${file.name}：请选择 JPG、PNG、WebP、AVIF 或 GIF 图片`); continue;
    }
    if (!file.size || file.size > 20 * 1024 * 1024) {
      errors.push(`${file.name}：图片须大于 0 且不超过 20 MB`); continue;
    }
    if (items.length >= MAX_IMAGE_IMPORT_FILES) { errors.push('每批最多 50 张，请完成本批后继续导入'); break; }
    const name = nextSalesImageImportName(kind, usedNames); usedNames.push(name);
    items.push({ key: `image-import-${crypto.randomUUID()}`, fileKey, file, name, status: 'queued' });
  }
  return { items, errors };
}

export function salesImageImportData(kind: SalesImageImportKind, item: SalesImageImportItem, imageUrl: string, category: SalesImageImportCategory): Record<string, unknown> {
  const dimensions = JSON.stringify({ salesImageImportKey: item.key });
  if (kind === 'persona') {
    const { views } = readPersonaViews(); views.main = imageUrl;
    return { name: item.name, tags: PERSONA_CATEGORIES[category.personaGroup], ...personaImageFields(views, [], dimensions, category.personaGroup, '') };
  }
  const { views } = readSceneViews(); views.main = imageUrl;
  return { title: item.name, tags: SCENE_SPACE_LABELS[category.sceneSpace], spatialType: category.sceneSpace === 'outdoor' ? 'outdoor' : 'indoor_room', ...sceneImageFields(views, [], dimensions) };
}

interface Services {
  catalog: (signal: AbortSignal) => Promise<readonly ImportedImageAsset[]>;
  upload: (file: File, signal: AbortSignal) => Promise<string>;
  save: (kind: SalesImageImportKind, data: Record<string, unknown>, signal: AbortSignal) => Promise<void>;
}

// Reconcile a lost save response before retrying, and retain uploaded originals.
export async function runSalesImageImportBatch(kind: SalesImageImportKind, items: readonly SalesImageImportItem[], category: SalesImageImportCategory,
  signal: AbortSignal, services: Services, onUpdate: (key: string, patch: Partial<SalesImageImportItem>) => void): Promise<number> {
  const assets = await services.catalog(signal);
  signal.throwIfAborted();
  const savedKeys = new Set(assets.map((asset) => audienceDimensions(asset.dimensions).salesImageImportKey).filter((key): key is string => typeof key === 'string'));
  const usedNames = assets.map((asset) => asset.name);
  let saved = 0;
  for (const item of items) {
    if (signal.aborted) break;
    if (item.status === 'done') continue;
    if (savedKeys.has(item.key)) { onUpdate(item.key, { status: 'done', error: '' }); saved++; continue; }
    const nextName = nextSalesImageImportName(kind, usedNames);
    const stalePreview = item.status === 'queued' && (salesAssetNumber(kind, item.name) ?? 0) < (salesAssetNumber(kind, nextName) ?? 0);
    const name = usedNames.includes(item.name) || stalePreview ? nextName : item.name;
    usedNames.push(name);
    onUpdate(item.key, { name });
    try {
      let imageUrl = item.imageUrl;
      if (!imageUrl) {
        onUpdate(item.key, { status: 'uploading', error: '' });
        imageUrl = await services.upload(item.file, signal);
        signal.throwIfAborted(); onUpdate(item.key, { imageUrl });
      }
      onUpdate(item.key, { status: 'saving', error: '' });
      await services.save(kind, salesImageImportData(kind, { ...item, name }, imageUrl, category), signal);
      signal.throwIfAborted(); saved++;
      onUpdate(item.key, { status: 'done', error: '' });
    } catch (error) {
      if (signal.aborted) break;
      onUpdate(item.key, { status: 'error', error: error instanceof Error ? error.message : '导入失败，请重试' });
    }
  }
  return saved;
}
