import type { UsageLogItem } from '@client/shared/utils/usageTracker';

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatUsageDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '未知时间';
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

export function formatUsageCost(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value > 0 && value < 0.01) return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  return value.toFixed(2);
}

function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildUsageCsv(logs: UsageLogItem[]): string {
  const types: Record<string, string> = { image: '图片生成', video: '视频生成', chat: 'AI 对话', vision: '视觉分析', distill: '模型提炼' };
  const headers = ['记录编号', '调用时间', '模型名称', '模型ID', '所属厂商', '业务类型', '输入Token', '输出Token', '总Token', '产出媒体数', '预估算力', '折算人民币(元)', '调用结果'];
  const rows = logs.map((log, index) => [
    index + 1, formatUsageDate(log.timestamp), log.modelName || log.modelId, log.modelId,
    log.provider || '网关', types[log.type] || log.type, log.promptTokens || 0,
    log.completionTokens || 0, log.totalTokens || 0, log.mediaCount || 0,
    formatUsageCost(log.costUsd), formatUsageCost(log.costRmb), log.success !== false ? '成功' : '失败',
  ]);
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
