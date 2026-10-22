import type { UsageLogItem } from './usageLog';
import { resolveModelVendor } from './modelVendor';

export type UsageRange = 'today' | '30d' | '90d' | '1y' | 'all';

export interface UsageHeatmapDayDetail {
  requests: number;
  tokens: number;
  costUsd: number;
  costRmb: number;
  imageCount: number;
  videoCount: number;
  promptTokens: number;
  completionTokens: number;
}

export interface UsageSummary {
  totalCostUsd: number;     // 总算力消耗 (点)
  totalCostRmb: number;     // 折算人民币金额 (¥)
  totalRequests: number;    // 总请求次数
  totalTokens: number;      // 总 Token 吞吐
  imageCount: number;
  videoCount: number;
  promptTokens: number;
  completionTokens: number;
  currentStreakDays: number;
  longestStreakDays: number;
  cacheHitRate: number;     // 缓存命中率
  activeDays: number;       // 活跃天数
  peakDayLabel: string;     // 高峰日
  peakDayTokens: number;    // 高峰日 Token
  peakDayRequests: number;  // 高峰日请求数
  topModelName: string;     // 用量最高模型
  topModelTokens: number;
  dailyAvgTokens: number;
  dailyAvgRequests: number;
  modelBreakdown: {
    id: string;
    name: string;
    vendor: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    mediaCount: number;
    type: string;
    costUsd: number;
    costRmb: number;
  }[];
  recentDaysActivity: {
    date: string;
    tokens: number;
    costUsd: number;
    costRmb: number;
    requests: number;
    items: { vendor: string; tokens: number; color: string }[];
  }[];
  heatmapActiveMap: Record<string, number>;
  heatmapDetailsMap?: Record<string, UsageHeatmapDayDetail>;
}

function dateKeyOf(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function usageLogsInRange(logs: UsageLogItem[], range: UsageRange, now = Date.now()) {
  const cutoff = rangeCutoff(range, now);
  return logs.filter((log) => Number.isFinite(log.timestamp) && log.timestamp >= cutoff && log.timestamp <= now);
}

function rangeCutoff(range: UsageRange, now: number) {
  if (range === 'all') return Number.NEGATIVE_INFINITY;
  if (range === 'today') {
    const date = new Date(now);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }
  const days = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  return now - days * 24 * 60 * 60 * 1000;
}

function streakStats(logs: UsageLogItem[], now: number) {
  const active = new Set(logs.filter(log => Number.isFinite(log.timestamp) && log.timestamp <= now).map(log => dateKeyOf(log.timestamp)));
  const hasDay = (offset: number) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    return active.has(dateKeyOf(date.getTime()));
  };
  let currentStreakDays = 0;
  const start = hasDay(0) ? 0 : hasDay(1) ? 1 : -1;
  if (start >= 0) {
    for (let offset = start; hasDay(offset); offset += 1) currentStreakDays += 1;
  }
  let longestStreakDays = 0;
  let run = 0;
  let previous: number | null = null;
  for (const key of [...active].sort()) {
    const [year, month, day] = key.split('-').map(Number);
    const time = new Date(year, month - 1, day).getTime();
    run = previous !== null && time - previous === 86_400_000 ? run + 1 : 1;
    longestStreakDays = Math.max(longestStreakDays, run);
    previous = time;
  }
  return { currentStreakDays, longestStreakDays };
}

/**
 * 计算指定时间范围内的真实统计指标
 */
export function buildUsageSummary(allLogs: UsageLogItem[], ratio: number, range: UsageRange): UsageSummary {
  const now = Date.now();
  const cutoffTime = rangeCutoff(range, now);
  const streaks = streakStats(allLogs, now);

  const filteredLogs = allLogs.filter(l => Number.isFinite(l.timestamp) && l.timestamp >= cutoffTime && l.timestamp <= now);

  if (filteredLogs.length === 0) {
    return {
      totalCostUsd: 0,
      totalCostRmb: 0,
      totalRequests: 0,
      totalTokens: 0,
      imageCount: 0,
      videoCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      ...streaks,
      cacheHitRate: 0,
      activeDays: 0,
      peakDayLabel: '暂无数据',
      peakDayTokens: 0,
      peakDayRequests: 0,
      topModelName: '暂无模型调用',
      topModelTokens: 0,
      dailyAvgTokens: 0,
      dailyAvgRequests: 0,
      modelBreakdown: [],
      recentDaysActivity: generateEmptyRecentDays(7),
      heatmapActiveMap: {},
      heatmapDetailsMap: {},
    };
  }

  let totalCostUsd = 0;
  let totalCostRmb = 0;
  let totalTokens = 0;
  let imageCount = 0;
  let videoCount = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let cachedCount = 0;
  const dayTokensMap: Record<string, number> = {};
  const dayRequestsMap: Record<string, number> = {};
  const dayCostUsdMap: Record<string, number> = {};
  const dayCostRmbMap: Record<string, number> = {};
  const dayImageMap: Record<string, number> = {};
  const dayVideoMap: Record<string, number> = {};
  const dayPromptMap: Record<string, number> = {};
  const dayCompletionMap: Record<string, number> = {};
  const modelMap: Record<string, {
    id: string;
    name: string;
    vendor: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    mediaCount: number;
    type: string;
    costUsd: number;
    costRmb: number;
  }> = {};


  filteredLogs.forEach(log => {
    // 🌟 自动校准历史遗留日志与新日志的真实所属厂商名称（杜绝厂商错标、漏标）
    const correctedVendor = resolveModelVendor(log.modelId || log.modelName, log.provider);

    // 🌟 纠正生图计数：仅限 image/video 类型的调用才计入生图数，vision/chat 视觉分析不计入
    const isMedia = log.type === 'image' || log.type === 'video';
    const effectiveMediaCount = isMedia ? (log.mediaCount ?? (log.success !== false ? 1 : 0)) : 0;

    const costUsd = log.costUsd || 0;
    const costRmb = Number.isFinite(log.costRmb) ? log.costRmb : Number((costUsd * ratio).toFixed(6));

    totalCostUsd += costUsd;
    totalCostRmb += costRmb;
    totalTokens += log.totalTokens || 0;
    if (log.cached) cachedCount++;

    // 按天归并 (YYYY-MM-DD)
    const dateKey = dateKeyOf(log.timestamp);
    dayTokensMap[dateKey] = (dayTokensMap[dateKey] || 0) + (log.totalTokens || 0);
    dayRequestsMap[dateKey] = (dayRequestsMap[dateKey] || 0) + 1;
    dayCostUsdMap[dateKey] = (dayCostUsdMap[dateKey] || 0) + costUsd;
    dayCostRmbMap[dateKey] = (dayCostRmbMap[dateKey] || 0) + costRmb;
    dayPromptMap[dateKey] = (dayPromptMap[dateKey] || 0) + (log.promptTokens || 0);
    dayCompletionMap[dateKey] = (dayCompletionMap[dateKey] || 0) + (log.completionTokens || 0);
    if (log.type === 'image') {
      imageCount += effectiveMediaCount;
      dayImageMap[dateKey] = (dayImageMap[dateKey] || 0) + effectiveMediaCount;
    }
    if (log.type === 'video') {
      videoCount += effectiveMediaCount;
      dayVideoMap[dateKey] = (dayVideoMap[dateKey] || 0) + effectiveMediaCount;
    }
    promptTokens += log.promptTokens || 0;
    completionTokens += log.completionTokens || 0;

    // 按模型归并
    const mKey = log.modelId || log.modelName || 'unknown';
    if (!modelMap[mKey]) {
      modelMap[mKey] = {
        id: log.modelId,
        name: log.modelName || log.modelId,
        vendor: correctedVendor || 'Comfly 网关',
        calls: 0,
        tokensIn: 0,
        tokensOut: 0,
        totalTokens: 0,
        mediaCount: 0,
        type: log.type,
        costUsd: 0,
        costRmb: 0
      };
    }
    modelMap[mKey].calls += 1;
    modelMap[mKey].vendor = correctedVendor || modelMap[mKey].vendor;
    modelMap[mKey].tokensIn += log.promptTokens || 0;
    modelMap[mKey].tokensOut += log.completionTokens || 0;
    modelMap[mKey].totalTokens += log.totalTokens || 0;
    modelMap[mKey].mediaCount += effectiveMediaCount;
    modelMap[mKey].costUsd += costUsd;
    modelMap[mKey].costRmb += costRmb;
  });

  const activeDays = Object.keys(dayRequestsMap).length;
  const cacheHitRate = filteredLogs.length > 0 ? (cachedCount / filteredLogs.length) * 100 : 0;

  // 寻找高峰日 (优先按 Token，若 Token 均为 0 则按请求次数最高日)
  let peakDayLabel = '暂无数据';
  let peakDayTokens = 0;
  let peakDayRequests = 0;
  Object.entries(dayTokensMap).forEach(([dateKey, tokens]) => {
    if (tokens > peakDayTokens) {
      peakDayTokens = tokens;
      peakDayLabel = dateKey;
    }
  });

  if (peakDayTokens === 0) {
    Object.entries(dayRequestsMap).forEach(([dateKey, reqs]) => {
      if (reqs > peakDayRequests) {
        peakDayRequests = reqs;
        peakDayLabel = dateKey;
      }
    });
  } else {
    peakDayRequests = dayRequestsMap[peakDayLabel] || 0;
  }

  // 寻找用量最高模型
  let topModelName = '暂无模型';
  let topModelTokens = 0;
  const modelBreakdown = Object.values(modelMap).sort((a, b) => b.calls - a.calls || b.totalTokens - a.totalTokens);
  if (modelBreakdown.length > 0) {
    topModelName = modelBreakdown[0].name;
    topModelTokens = modelBreakdown[0].totalTokens;
  }

  // 生成最近7天活动走势
  const recentDaysActivity = [];
  const VENDOR_COLORS: Record<string, string> = {
    'Google': 'bg-[#3B82F6]',
    'OpenAI': 'bg-[#EA580C]',
    'Anthropic': 'bg-[#D97706]',
    '字节即梦': 'bg-[#0D9488]',
    '快手可灵': 'bg-[#10B981]',
    '阿里百炼': 'bg-[#8B5CF6]',
    'DeepSeek': 'bg-[#06B6D4]',
    'xAI': 'bg-[#EC4899]',
    'MiniMax': 'bg-[#14B8A6]',
    'FLUX': 'bg-[#F97316]'
  };

  for (let i = 6; i >= 0; i--) {
    const t = new Date(now - i * 24 * 60 * 60 * 1000);
    const dateKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    const label = i === 0 ? '今天' : `${t.getMonth() + 1}/${t.getDate()}`;
    const dayLogs = filteredLogs.filter(l => {
      const ld = new Date(l.timestamp);
      return `${ld.getFullYear()}-${String(ld.getMonth() + 1).padStart(2, '0')}-${String(ld.getDate()).padStart(2, '0')}` === dateKey;
    });

    const vendorGroup: Record<string, number> = {};
    dayLogs.forEach(l => {
      const v = l.provider || 'Comfly 网关';
      vendorGroup[v] = (vendorGroup[v] || 0) + (l.totalTokens || 100);
    });

    const items = Object.entries(vendorGroup).map(([vendor, tokens]) => ({
      vendor,
      tokens,
      color: VENDOR_COLORS[vendor] || 'bg-slate-700'
    }));

    recentDaysActivity.push({
      date: label,
      tokens: dayTokensMap[dateKey] || 0,
      costUsd: dayCostUsdMap[dateKey] || 0,
      costRmb: dayCostRmbMap[dateKey] || 0,
      requests: dayRequestsMap[dateKey] || 0,
      items
    });
  }

  return {
    totalCostUsd: Number(totalCostUsd.toFixed(6)),
    totalCostRmb: Number(totalCostRmb.toFixed(6)),
    totalRequests: filteredLogs.length,
    totalTokens,
    imageCount,
    videoCount,
    promptTokens,
    completionTokens,
    ...streaks,
    cacheHitRate: Number(cacheHitRate.toFixed(1)),
    activeDays,
    peakDayLabel,
    peakDayTokens,
    peakDayRequests,
    topModelName,
    topModelTokens,
    dailyAvgTokens: Math.round(totalTokens / Math.max(1, activeDays)),
    dailyAvgRequests: Math.round(filteredLogs.length / Math.max(1, activeDays)),
    modelBreakdown,
    recentDaysActivity,
    heatmapActiveMap: dayRequestsMap,
    heatmapDetailsMap: Object.keys(dayRequestsMap).reduce((acc, k) => {
      acc[k] = {
        requests: dayRequestsMap[k] || 0,
        tokens: dayTokensMap[k] || 0,
        costUsd: Number((dayCostUsdMap[k] || 0).toFixed(6)),
        costRmb: Number((dayCostRmbMap[k] || 0).toFixed(6)),
        imageCount: dayImageMap[k] || 0,
        videoCount: dayVideoMap[k] || 0,
        promptTokens: dayPromptMap[k] || 0,
        completionTokens: dayCompletionMap[k] || 0,
      };
      return acc;
    }, {} as Record<string, UsageHeatmapDayDetail>)
  };
}

function generateEmptyRecentDays(count: number) {
  const days = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(now - i * 24 * 60 * 60 * 1000);
    days.push({
      date: i === 0 ? '今天' : `${t.getMonth() + 1}/${t.getDate()}`,
      tokens: 0,
      costUsd: 0,
      costRmb: 0,
      requests: 0,
      items: []
    });
  }
  return days;
}
