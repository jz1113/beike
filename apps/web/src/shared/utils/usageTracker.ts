// src/lib/usageTracker.ts

/**
 * 🌟 算力与人民币标准折算汇率
 * 
 * 官方标准：1 算力 = 1.20 元人民币 (¥1.20 CNY)
 * 用户可在 localStorage 中自定义 quota_exchange_rate
 */
export function getQuotaToRmbRatio(): number {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('quota_exchange_rate');
    if (custom) {
      const val = parseFloat(custom);
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return 1.20; // 默认 1 算力 = ¥1.20 CNY
}

export const COMFLY_QUOTA_TO_RMB_RATIO = 1.20; // 1 算力 = 1.20 元人民币 (¥1.20 CNY)

export { type ModelPricingRule, COMFY_MODEL_PRICING } from './modelPricing.data';
export { resolveModelVendor } from './modelVendor';
import { COMFY_MODEL_PRICING } from './modelPricing.data';
import { resolveModelVendor } from './modelVendor';

export interface UsageLogItem {
  id: string;
  timestamp: number; // Date.now()
  modelId: string;
  modelName: string;
  provider: string;
  type: 'image' | 'video' | 'chat' | 'vision' | 'distill';
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  mediaCount?: number;
  costUsd: number;  // 算力消耗 (点)
  costRmb: number;  // 折算人民币金额 (¥) = costUsd * 1.2
  success: boolean;
  cached?: boolean;
}

const STORAGE_KEY = 'app_real_usage_logs';

/**
 * 🌟 严格依据 Comfly 官方报价单与扣费公式计算调用成本 ($USD)
 * 
 * 扣费公式:
 * - 文本类: (Prompt Tokens / 1000) * Prompt 单价 + (Completion Tokens / 1000) * Completion 单价
 * - 生图类: 固定单价 ($/张) * 数量
 * - 视频类: 固定单价或 (按秒单价 * 秒数) * 数量
 */
export function estimateModelCost(
  modelId: string, 
  type: 'image' | 'video' | 'chat' | 'vision' | 'distill', 
  params: { promptTokens?: number; completionTokens?: number; totalTokens?: number; mediaCount?: number; duration?: number }
): number {
  const m = modelId.toLowerCase().trim();
  
  // 1. 优先在官方单价字典中精确查找
  let rule = COMFY_MODEL_PRICING[m];
  if (!rule) {
    // 模糊匹配前缀
    const matchedKey = Object.keys(COMFY_MODEL_PRICING).find(k => m.includes(k) || k.includes(m));
    if (matchedKey) rule = COMFY_MODEL_PRICING[matchedKey];
  }

  // 2. 图片生成计费
  if (type === 'image') {
    const count = params.mediaCount || 1;
    if (rule?.fixedPerUnit) return count * rule.fixedPerUnit;
    if (m.includes('gpt-image-2-4k') || m.includes('image2-4k')) return count * 0.08;
    if (m.includes('gpt-image-2-2k')) return count * 0.06;
    if (m.includes('gpt-image-2')) return count * 0.06;
    if (m.includes('seedream-5') || m.includes('seededit')) return count * 0.15;
    if (m.includes('seedream')) return count * 0.14;
    if (m.includes('flux-ultra') || m.includes('1.1-ultra')) return count * 0.25;
    if (m.includes('flux-pro') || m.includes('1.1-pro')) return count * 0.10;
    if (m.includes('flux')) return count * 0.01;
    if (m.includes('midjourney') || m.includes('mj')) return count * 0.20;
    if (m.includes('dall-e-3')) return count * 0.04;
    if (m.includes('kling')) return count * 0.10;
    if (m.includes('qwen-image')) return count * 0.25;
    return count * 0.05;
  }

  // 3. 视频生成计费
  if (type === 'video') {
    const count = params.mediaCount || 1;
    const dur = params.duration || 5;
    if (rule?.perSecPrice) return count * dur * rule.perSecPrice;
    if (rule?.fixedPerUnit) return count * rule.fixedPerUnit;
    if (m.includes('seedance-2.0') || m.includes('seedance-2-0')) return count * dur * 0.50;
    if (m.includes('seedance')) return count * (dur >= 10 ? 5.0 : 2.5);
    if (m.includes('kling-v2-master')) return count * (dur >= 10 ? 20.0 : 10.0);
    if (m.includes('kling')) return count * (dur >= 10 ? 5.0 : 2.5);
    if (m.includes('veo3.1-pro-4k')) return count * 13.0;
    if (m.includes('veo3') || m.includes('veo2') || m.includes('veo')) return count * 1.20;
    if (m.includes('wan2.6')) return count * 5.00;
    if (m.includes('wanx')) return count * 3.50;
    if (m.includes('hailuo-2.3') || m.includes('minimax')) return count * (dur >= 10 ? 4.0 : 2.0);
    if (m.includes('hailuo-02')) return count * (dur >= 10 ? 1.0 : 0.6);
    if (m.includes('sora')) return count * dur * 0.40;
    if (m.includes('luma')) return count * 2.00;
    if (m.includes('runway')) return count * 0.80;
    return count * 2.00;
  }

  // 4. 对话 / 视觉分析 / 深度思考 / Skill 提炼 (Token 扣费标准)
  let promptTokens = params.promptTokens;
  let completionTokens = params.completionTokens;

  if (promptTokens === undefined && completionTokens === undefined) {
    const total = params.totalTokens || 500;
    // 默认按照 60% 输入，40% 输出拆分
    promptTokens = Math.round(total * 0.6);
    completionTokens = Math.round(total * 0.4);
  } else {
    promptTokens = promptTokens || 0;
    completionTokens = completionTokens || 0;
  }

  const pPrice = rule?.promptPer1k ?? 0.0015;
  const cPrice = rule?.completionPer1k ?? 0.0075;

  // 官方扣费公式: (Prompt / 1000) * PromptPrice + (Completion / 1000) * CompletionPrice
  const cost = (promptTokens / 1000) * pPrice + (completionTokens / 1000) * cPrice;
  return Number(cost.toFixed(6));
}

/**
 * 获取所有持久化真实调用日志
 */
export function getUsageLogs(): UsageLogItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('读取用量统计日志失败:', e);
    return [];
  }
}

/**
 * 安全保存用量日志到 LocalStorage，保留最近 5000 条真实调用记录
 */
function safeSaveUsageLogs(logs: UsageLogItem[]): void {
  if (typeof window === 'undefined') return;

  // 默认保留最近 5000 条，兼顾精细全周期统计与 LocalStorage 存储安全
  let targetList = logs.slice(0, 5000);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(targetList));
      return;
    } catch (e: any) {
      const isQuota = 
        e?.name === 'QuotaExceededError' || 
        e?.code === 22 || 
        e?.code === 1014 || 
        e?.number === -2147024882 ||
        (typeof e?.message === 'string' && e.message.toLowerCase().includes('quota'));

      if (isQuota) {
        // 容量超标，按梯度动态裁减：5000 -> 2500 -> 1000 -> 300
        const nextLen = Math.floor(targetList.length * 0.5);
        if (nextLen < 50) {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
          return;
        }
        targetList = targetList.slice(0, nextLen);
      } else {
        return;
      }
    }
  }
}

/**
 * 记录一次真实模型调用
 */
export function recordModelUsage(item: Omit<UsageLogItem, 'id' | 'timestamp' | 'costUsd' | 'costRmb'> & { 
  timestamp?: number;
  costUsd?: number;
  duration?: number;
}): void {
  if (typeof window !== 'undefined') {
    try {
      const logs = getUsageLogs();
      const calculatedCostUsd = item.costUsd !== undefined 
        ? item.costUsd 
        : estimateModelCost(item.modelId, item.type, {
            promptTokens: item.promptTokens,
            completionTokens: item.completionTokens,
            totalTokens: item.totalTokens,
            mediaCount: item.mediaCount,
            duration: item.duration
          });

      const costUsd = Number(calculatedCostUsd.toFixed(6));
      const ratio = getQuotaToRmbRatio();
      const costRmb = Number((costUsd * ratio).toFixed(6));

      // 提取供应商名称（通过 resolveModelVendor 统一校准）
      const vendor = resolveModelVendor(item.modelId, item.provider);

      const newLog: UsageLogItem = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        timestamp: item.timestamp || Date.now(),
        modelId: item.modelId,
        modelName: item.modelName || item.modelId,
        provider: vendor,
        type: item.type,
        promptTokens: item.promptTokens || 0,
        completionTokens: item.completionTokens || 0,
        totalTokens: item.totalTokens || ((item.promptTokens || 0) + (item.completionTokens || 0)) || 0,
        mediaCount: item.mediaCount || (item.type === 'image' || item.type === 'video' ? 1 : 0),
        costUsd,
        costRmb,
        success: item.success,
        cached: !!item.cached
      };

      logs.unshift(newLog);
      safeSaveUsageLogs(logs);
    } catch {}
  }
}

/**
 * 清空用量统计日志
 */
export function clearUsageLogs(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export interface UsageSummary {
  totalCostUsd: number;     // 总算力消耗 (点)
  totalCostRmb: number;     // 折算人民币金额 (¥)
  totalRequests: number;    // 总请求次数
  totalTokens: number;      // 总 Token 吞吐
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
  heatmapDetailsMap?: Record<string, { requests: number; tokens: number; costUsd: number; costRmb: number }>;
}

/**
 * 计算指定时间范围内的真实统计指标
 */
export function getUsageSummary(range: '30d' | '90d' | '1y' = '30d'): UsageSummary {
  const allLogs = getUsageLogs();
  const now = Date.now();
  const daysLimit = range === '30d' ? 30 : range === '90d' ? 90 : 365;
  const cutoffTime = now - daysLimit * 24 * 60 * 60 * 1000;

  const filteredLogs = allLogs.filter(l => l.timestamp >= cutoffTime);

  if (filteredLogs.length === 0) {
    return {
      totalCostUsd: 0,
      totalCostRmb: 0,
      totalRequests: 0,
      totalTokens: 0,
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
      heatmapActiveMap: {}
    };
  }

  let totalCostUsd = 0;
  let totalCostRmb = 0;
  let totalTokens = 0;
  let cachedCount = 0;
  const dayTokensMap: Record<string, number> = {};
  const dayRequestsMap: Record<string, number> = {};
  const dayCostUsdMap: Record<string, number> = {};
  const dayCostRmbMap: Record<string, number> = {};
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

  const ratio = getQuotaToRmbRatio();

  filteredLogs.forEach(log => {
    // 🌟 自动校准历史遗留日志与新日志的真实所属厂商名称（杜绝厂商错标、漏标）
    const correctedVendor = resolveModelVendor(log.modelId || log.modelName, log.provider);

    // 🌟 纠正生图计数：仅限 image/video 类型的调用才计入生图数，vision/chat 视觉分析不计入
    const isMedia = log.type === 'image' || log.type === 'video';
    const effectiveMediaCount = isMedia ? (log.mediaCount || 1) : 0;

    const costUsd = log.costUsd || 0;
    const costRmb = Number((costUsd * ratio).toFixed(4));

    totalCostUsd += costUsd;
    totalCostRmb += costRmb;
    totalTokens += log.totalTokens || 0;
    if (log.cached) cachedCount++;

    // 按天归并 (YYYY-MM-DD)
    const d = new Date(log.timestamp);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dayTokensMap[dateKey] = (dayTokensMap[dateKey] || 0) + (log.totalTokens || 0);
    dayRequestsMap[dateKey] = (dayRequestsMap[dateKey] || 0) + 1;
    dayCostUsdMap[dateKey] = (dayCostUsdMap[dateKey] || 0) + costUsd;
    dayCostRmbMap[dateKey] = (dayCostRmbMap[dateKey] || 0) + costRmb;

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
    totalCostUsd: Number(totalCostUsd.toFixed(2)),
    totalCostRmb: Number(totalCostRmb.toFixed(2)),
    totalRequests: filteredLogs.length,
    totalTokens,
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
        costUsd: Number((dayCostUsdMap[k] || 0).toFixed(2)),
        costRmb: Number((dayCostRmbMap[k] || 0).toFixed(2)),
      };
      return acc;
    }, {} as Record<string, { requests: number; tokens: number; costUsd: number; costRmb: number }>)
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
