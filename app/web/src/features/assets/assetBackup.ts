/**
 * 去除资产对象中的持久化主键与时间戳元数据
 */
export function stripMeta(row: Record<string, unknown>): Record<string, unknown> {
  const { id: _, createdAt: __, updatedAt: ___, ...rest } = row;
  return rest;
}

/**
 * 构造资产库全量 JSON 备份结构
 */
export function buildBackupData(data: {
  scenes?: any[];
  outfits?: any[];
  actions?: any[];
  personas?: any[];
  fullPrompts?: any[];
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
export function parseBackupDataToBulkItems(text: string): ParsedBulkImportItem[] {
  const parsed = JSON.parse(text);
  const assets = parsed.data || parsed;
  if (parsed.version && !['1.0', '2.0'].includes(parsed.version)) throw new Error('不支持的备份版本');
  if (parsed.version === '2.0') {
    for (const key of ['scenes', 'outfits', 'actions', 'personas', 'fullPrompts']) {
      if (!Array.isArray(assets[key]) || parsed.counts?.[key] !== assets[key].length) throw new Error('备份数量校验失败');
    }
  }
  if (
    !assets.scenes &&
    !assets.outfits &&
    !assets.actions &&
    !assets.personas &&
    !assets.fullPrompts
  ) {
    throw new Error('无效的资产库备份文件格式');
  }

  const bulkItems: ParsedBulkImportItem[] = [];

  if (Array.isArray(assets.fullPrompts)) {
    for (const f of assets.fullPrompts) {
      bulkItems.push({ assetType: 'full_prompt', data: stripMeta(f), sourceId: typeof f.id === "string" ? f.id : undefined });
    }
  }
  if (Array.isArray(assets.scenes)) {
    for (const s of assets.scenes) {
      bulkItems.push({ assetType: 'scene', data: stripMeta(s), sourceId: typeof s.id === "string" ? s.id : undefined });
    }
  }
  if (Array.isArray(assets.outfits)) {
    for (const o of assets.outfits) {
      bulkItems.push({ assetType: 'outfit', data: stripMeta(o), sourceId: typeof o.id === "string" ? o.id : undefined });
    }
  }
  if (Array.isArray(assets.actions)) {
    for (const a of assets.actions) {
      bulkItems.push({ assetType: 'action', data: stripMeta(a), sourceId: typeof a.id === "string" ? a.id : undefined });
    }
  }
  if (Array.isArray(assets.personas)) {
    for (const p of assets.personas) {
      bulkItems.push({ assetType: 'persona', data: stripMeta(p), sourceId: typeof p.id === "string" ? p.id : undefined });
    }
  }

  return bulkItems;
}
