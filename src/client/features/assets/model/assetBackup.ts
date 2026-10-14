/**
 * 去除资产对象中的持久化主键与时间戳元数据
 */
export function stripMeta(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row };
  delete rest.id; delete rest.createdAt; delete rest.updatedAt;
  return rest;
}

/**
 * 构造资产库全量 JSON 备份结构
 */
export function buildBackupData(data: {
  scenes?: unknown[];
  outfits?: unknown[];
  actions?: unknown[];
  personas?: unknown[];
  fullPrompts?: unknown[];
  productCategories?: unknown[];
  albums?: unknown[];
  promptAssetRegistries?: unknown[];
  fullPromptImageReplacements?: unknown[];
}) {
  return {
    exportedAt: new Date().toISOString(),
    version: '3.1',
    mediaIncluded: false,
    counts: {
      scenes: data.scenes?.length || 0,
      outfits: data.outfits?.length || 0,
      actions: data.actions?.length || 0,
      personas: data.personas?.length || 0,
      fullPrompts: data.fullPrompts?.length || 0,
      productCategories: data.productCategories?.length || 0,
      albums: data.albums?.length || 0,
      promptAssetRegistries: data.promptAssetRegistries?.length || 0,
      fullPromptImageReplacements: data.fullPromptImageReplacements?.length || 0,
    },
    system: 'beike-yuntu-prompt-assets',
    productCategories: data.productCategories || [],
    albums: data.albums || [],
    promptAssetRegistries: data.promptAssetRegistries || [],
    fullPromptImageReplacements: data.fullPromptImageReplacements || [],
    data: {
      scenes: data.scenes || [],
      outfits: data.outfits || [],
      actions: data.actions || [],
      personas: data.personas || [],
      fullPrompts: data.fullPrompts || [],
    },
  };
}

export interface ParsedBulkImportItem {
  assetType: 'full_prompt' | 'scene' | 'outfit' | 'action' | 'persona';
  data: Record<string, unknown>;
  sourceId?: string;
}

export interface ParsedBackupData {
  items: ParsedBulkImportItem[];
  productCategories: Record<string, unknown>[];
  albums: Record<string, unknown>[];
  promptAssetRegistries: Record<string, unknown>[];
  fullPromptImageReplacements: Record<string, unknown>[];
}

/**
 * 解析并校验导入的 JSON 备份数据，生成待导入的扁平项列表
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const backupCollections = {
  fullPrompts: 'full_prompt', scenes: 'scene', outfits: 'outfit', actions: 'action', personas: 'persona',
} as const;

function recordRows(value: unknown, required: boolean): Record<string, unknown>[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) {
    throw new Error('无效的资产库备份条目');
  }
  return value;
}

export function parseBackupDataToBulkItems(text: string): ParsedBackupData {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error('无效的资产库备份文件格式');
  const assets = parsed.data ?? parsed;
  if (!isRecord(assets)) throw new Error('无效的资产库备份文件格式');
  if (parsed.version && parsed.version !== '1.0' && parsed.version !== '2.0' && parsed.version !== '3.0' && parsed.version !== '3.1') throw new Error('不支持的备份版本');
  const keys = Object.keys(backupCollections) as Array<keyof typeof backupCollections>;
  const organized = parsed.version === '3.0' || parsed.version === '3.1';
  const productCategories = recordRows(parsed.productCategories, organized);
  const albums = recordRows(parsed.albums, organized);
  const promptAssetRegistries = organized
    ? recordRows(parsed.promptAssetRegistries, false)
    : [];
  const fullPromptImageReplacements = parsed.version === '3.1'
    ? recordRows(parsed.fullPromptImageReplacements, true)
    : [];
  if (parsed.version === '2.0' || organized) {
    if (!isRecord(parsed.counts)) throw new Error('备份数量校验失败');
    for (const key of keys) {
      const rows = assets[key];
      if (!Array.isArray(rows) || parsed.counts[key] !== rows.length) throw new Error('备份数量校验失败');
    }
    if (organized &&
      (parsed.counts.productCategories !== productCategories.length || parsed.counts.albums !== albums.length)) {
      throw new Error('备份数量校验失败');
    }
    if (organized && (
      (parsed.promptAssetRegistries === undefined) !== (parsed.counts.promptAssetRegistries === undefined) ||
      (parsed.promptAssetRegistries !== undefined && parsed.counts.promptAssetRegistries !== promptAssetRegistries.length)
    )) throw new Error('备份数量校验失败');
    if (parsed.version === '3.1' && parsed.counts.fullPromptImageReplacements !== fullPromptImageReplacements.length) {
      throw new Error('备份数量校验失败');
    }
  }
  if (!keys.some((key) => Array.isArray(assets[key]))) throw new Error('无效的资产库备份文件格式');
  const bulkItems: ParsedBulkImportItem[] = [];
  for (const key of keys) {
    const rows = assets[key];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) throw new Error('无效的资产库备份文件格式');
    for (const row of rows) {
      if (!isRecord(row)) throw new Error('无效的资产库备份条目');
      bulkItems.push({ assetType: backupCollections[key], data: stripMeta(row), sourceId: typeof row.id === 'string' ? row.id : undefined });
    }
  }
  return { items: bulkItems, productCategories, albums, promptAssetRegistries, fullPromptImageReplacements };
}
