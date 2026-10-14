import { buildUsageSummary, type UsageRange, type UsageSummary } from './usageSummary';
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

import type { UsageLogItem } from './usageLog';
export type { UsageLogItem } from './usageLog';

const STORAGE_KEY = 'app_real_usage_logs';

/**
 * 🌟 根据本地参考单价估算调用成本 ($USD)；实际扣费以网关账单为准。
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
    const count = params.mediaCount ?? 1;
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
    const count = params.mediaCount ?? 1;
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
        timestamp: item.timestamp ?? Date.now(),
        modelId: item.modelId,
        modelName: item.modelName || item.modelId,
        provider: vendor,
        type: item.type,
        promptTokens: item.promptTokens || 0,
        completionTokens: item.completionTokens || 0,
        totalTokens: item.totalTokens || ((item.promptTokens || 0) + (item.completionTokens || 0)) || 0,
        mediaCount: item.mediaCount ?? ((item.type === 'image' || item.type === 'video') && item.success !== false ? 1 : 0),
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

export { type UsageSummary, type UsageRange } from './usageSummary';

export function getUsageSummary(range: UsageRange = '30d'): UsageSummary {
  return buildUsageSummary(getUsageLogs(), getQuotaToRmbRatio(), range);
}
