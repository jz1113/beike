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
}) {
  return {
    exportedAt: new Date().toISOString(),
    version: '2.0',
    mediaIncluded: false,
    counts: { scenes: data.scenes?.length || 0, outfits: data.outfits?.length || 0, actions: data.actions?.length || 0, personas: data.personas?.length || 0, fullPrompts: data.fullPrompts?.length || 0 },
    system: 'beike-yuntu-prompt-assets',
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

/**
 * 解析并校验导入的 JSON 备份数据，生成待导入的扁平项列表
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const backupCollections = {
  fullPrompts: 'full_prompt', scenes: 'scene', outfits: 'outfit', actions: 'action', personas: 'persona',
} as const;

export function parseBackupDataToBulkItems(text: string): ParsedBulkImportItem[] {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error('无效的资产库备份文件格式');
  const assets = parsed.data ?? parsed;
  if (!isRecord(assets)) throw new Error('无效的资产库备份文件格式');
  if (parsed.version && parsed.version !== '1.0' && parsed.version !== '2.0') throw new Error('不支持的备份版本');
  const keys = Object.keys(backupCollections) as Array<keyof typeof backupCollections>;
  if (parsed.version === '2.0') {
    if (!isRecord(parsed.counts)) throw new Error('备份数量校验失败');
    for (const key of keys) {
      const rows = assets[key];
      if (!Array.isArray(rows) || parsed.counts[key] !== rows.length) throw new Error('备份数量校验失败');
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
  return bulkItems;
}
