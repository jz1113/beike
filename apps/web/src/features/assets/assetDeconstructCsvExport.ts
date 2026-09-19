import { saveToDownloadDir } from '@/lib/desktopDownload';

export interface DeconstructedRecordRow {
  sourceUrl?: string;
  title: string;
  author?: string;
  imageCount: number;
  imageUrls: string[];
  fullPrompt: string;
  personaSummary?: string;
  outfitSummary?: string;
  sceneSummary?: string;
  actionSummary?: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  skipReason?: string;
  timestamp: string;
}

function escapeCsvCell(val: unknown): string {
  if (val === undefined || val === null) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

export function resolveQueueItemPartial(item: {
  status?: string;
  partial?: boolean;
  deconstructStats?: {
    pass1Failed?: number;
    pass2Skipped?: boolean;
  };
}): boolean {
  if (item.status === 'error') return false;
  if (item.status !== 'done') return false;
  return (
    item.partial === true ||
    (typeof item.deconstructStats?.pass1Failed === 'number' && item.deconstructStats.pass1Failed > 0) ||
    item.deconstructStats?.pass2Skipped === true
  );
}

export function resolveQueueItemStatus(item: {
  status?: string;
  partial?: boolean;
  deconstructStats?: {
    pass1Failed?: number;
    pass2Skipped?: boolean;
  };
}): DeconstructedRecordRow['status'] {
  if (item.status === 'error') return 'failed';
  if (item.status !== 'done') return 'skipped';
  return resolveQueueItemPartial(item) ? 'partial' : 'success';
}

/**
 * 将队列反推结果转换为报表行数据
 */
export function transformQueueItemToRecordRow(item: any): DeconstructedRecordRow {
  const result = item.result as any;
  const scenes = Array.isArray(result?.scenes) ? result.scenes : (result?.scene ? [result.scene] : []);
  const outfits = Array.isArray(result?.outfits) ? result.outfits : (result?.outfit ? [result.outfit] : []);
  const actions = Array.isArray(result?.actions) ? result.actions : (result?.action ? [result.action] : []);
  const persona = result?.persona;

  const fullPrompt =
    result?.master_prompt ||
    result?.reversePrompt ||
    scenes[0]?.reversePrompt ||
    persona?.reversePrompt ||
    outfits[0]?.reversePrompt ||
    '';

  const personaSummary = persona
    ? `【${persona.name || '博主'}】: ${persona.description || persona.reversePrompt || ''}`
    : '';

  const outfitSummary = outfits
    .map(
      (o: any, i: number) =>
        `[穿搭${i + 1}-${o.title || ''}] 上装:${o.top || '-'}, 下装:${o.bottom || '-'}, 鞋履:${o.shoes || '-'}, 配色:${o.color_palette || '-'}`
    )
    .join('; ');

  const sceneSummary = scenes
    .map(
      (s: any, i: number) =>
        `[场景${i + 1}-${s.title || ''}] 类型:${s.spatial_type || '-'}, 光影:${s.lighting || '-'}, 描述:${s.description || '-'}`
    )
    .join('; ');

  const actionSummary = actions
    .map(
      (a: any, i: number) =>
        `[动作${i + 1}-${a.title || ''}] 景别:${a.shot_type || '-'}, 动作:${a.action || '-'}, 镜头:${a.camera || '-'}`
    )
    .join('; ');

  return {
    sourceUrl: item.sourceUrl,
    title: item.name,
    author: item.author,
    imageCount: Array.isArray(item.images) ? item.images.length : 0,
    imageUrls: Array.isArray(item.images) ? item.images : [],
    fullPrompt,
    personaSummary,
    outfitSummary,
    sceneSummary,
    actionSummary,
    status: resolveQueueItemStatus(item),
    skipReason: item.error,
    timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
  };
}

/**
 * 将图集智能反推记录构建为标准 CSV 内容（带 UTF-8 BOM，防止 Excel 打开乱码）
 */
export function buildDeconstructCsvContent(records: DeconstructedRecordRow[]): string {
  const headers = [
    '序号',
    '小红书采集链接',
    '笔记标题',
    '笔记作者',
    '分析图片数',
    '分析图片链接 (URLs)',
    '分析后的整条提示词 (Master Prompt)',
    '人物博主拆分',
    '穿搭OOTD拆分',
    '场景空间拆分',
    '动作姿态拆分',
    '反推状态',
    '备注/跳过原因',
    '处理时间',
  ];

  const rows = records.map((r, idx) => {
    return [
      escapeCsvCell(idx + 1),
      escapeCsvCell(r.sourceUrl || ''),
      escapeCsvCell(r.title || ''),
      escapeCsvCell(r.author || ''),
      escapeCsvCell(r.imageCount),
      escapeCsvCell((r.imageUrls || []).join('\n')),
      escapeCsvCell(r.fullPrompt || ''),
      escapeCsvCell(r.personaSummary || ''),
      escapeCsvCell(r.outfitSummary || ''),
      escapeCsvCell(r.sceneSummary || ''),
      escapeCsvCell(r.actionSummary || ''),
      escapeCsvCell(r.status === 'success' ? '成功' : r.status === 'partial' ? '部分成功' : r.status === 'skipped' ? '已跳过' : '失败'),
      escapeCsvCell(r.skipReason || ''),
      escapeCsvCell(r.timestamp || new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })),
    ].join(',');
  });

  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
}

/**
 * 自动导出反推记录表格并保存到本地下载目录
 */
export async function exportDeconstructRecordsToCsv(
  records: DeconstructedRecordRow[],
  customFilename?: string
): Promise<string> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const filename =
    customFilename || `小红书图集智能反推明细表_${dateStr}_${timeStr}.csv`;

  const csvContent = buildDeconstructCsvContent(records);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  await saveToDownloadDir(filename, blob);
  return filename;
}
