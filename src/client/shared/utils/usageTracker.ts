import { createUsageScope, sameUsageScope, type UsageScope } from './usageScope';
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

import type { UsageLogItem } from './usageScope';
export type { UsageLogItem } from './usageScope';

import { readUsageReceipts, saveUsageReceipt, clearUsageReceipts, currentUsageEpoch } from './usageStorage';
export { USAGE_LOG_EVENT } from './usageStorage';

type Identity = { scope: UsageScope; taskId?: string; localTaskId?: string; recordId?: string };

function findUsageLog(logs: UsageLogItem[], identity: Identity): UsageLogItem | undefined {
  const candidates = logs.filter(log => sameUsageScope(log.scope, identity.scope));
  const exact = candidates.find(log => identity.recordId && log.recordId === identity.recordId
    || identity.localTaskId && log.localTaskId === identity.localTaskId && (!identity.recordId || !log.recordId || log.recordId === identity.recordId));
  if (exact) return exact;
  const remote = candidates.filter(log => identity.taskId && log.taskId === identity.taskId
    && (!identity.recordId || !log.recordId || log.recordId === identity.recordId)
    && (!identity.localTaskId || !log.localTaskId || log.localTaskId === identity.localTaskId));
  return remote.length === 1 ? remote[0] : undefined;
}

function count(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0; }

/** Merge cumulative receipts, including disjoint detail fields and stale replays. */
function mergeUsageTokens(existing: UsageLogItem, incoming: { promptTokens?: number; completionTokens?: number; totalTokens?: number }): boolean {
  const prompt = Math.max(count(existing.promptTokens), count(incoming.promptTokens));
  const completion = Math.max(count(existing.completionTokens), count(incoming.completionTokens));
  const total = Math.max(count(existing.totalTokens), count(incoming.totalTokens), prompt + completion);
  const changed = existing.promptTokens !== prompt || existing.completionTokens !== completion || existing.totalTokens !== total;
  existing.promptTokens = prompt; existing.completionTokens = completion; existing.totalTokens = total;
  return changed;
}

/** Output counts only grow after a confirmed result; stale page receipts cannot undo success. */
function mergeUsageOutcome(existing: UsageLogItem, incoming: { success: boolean; mediaCount?: number; billableCount?: number }): boolean {
  const success = existing.success || incoming.success;
  const mediaCount = Math.max(count(existing.mediaCount), count(incoming.mediaCount));
  const billableCount = existing.billableCount === undefined && incoming.billableCount === undefined ? undefined : Math.max(count(existing.billableCount), count(incoming.billableCount));
  const changed = existing.success !== success || existing.mediaCount !== mediaCount || existing.billableCount !== billableCount;
  existing.success = success; existing.mediaCount = mediaCount; existing.billableCount = billableCount;
  return changed;
}

/**
 * 🌟 根据所用网关默认分组的参考单价估算调用成本（算力）；实际扣费以网关账单为准。
 *
 * 扣费公式:
 * - 文本类: (Prompt Tokens / 1000) * Prompt 单价 + (Completion Tokens / 1000) * Completion 单价
 * - 生图类: 固定单价 ($/张) * 数量
 * - 视频类: 固定单价或 (按秒单价 * 秒数) * 数量；支持按分辨率计价
 */
export function estimateModelCost(
  modelId: string,
  type: 'image' | 'video' | 'chat' | 'vision' | 'distill' | 'audio',
  params: { promptTokens?: number; completionTokens?: number; totalTokens?: number; mediaCount?: number; billableCount?: number; duration?: number; resolution?: string }
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
    const count = params.billableCount ?? params.mediaCount ?? 1;
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
    const count = params.billableCount ?? params.mediaCount ?? 1;
    const dur = params.duration || 5;
    const resolution = params.resolution?.trim().toUpperCase();
    const resolutionPrice = resolution ? rule?.perSecPriceByResolution?.[resolution] : undefined;
    if (resolutionPrice !== undefined) return count * dur * resolutionPrice;
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
  const logs: UsageLogItem[] = [];
  for (const incoming of readUsageReceipts().sort((a, b) => a.timestamp - b.timestamp)) {
    const existing = logs.find(row => row.id === incoming.id) || (incoming.scope ? findUsageLog(logs, { ...incoming, scope: incoming.scope }) : undefined);
    if (!existing) { logs.push({ ...incoming }); continue; }
    const reported = incoming.costSource === 'reported' ? { ...incoming } : existing.costSource === 'reported' ? { ...existing } : undefined;
    const tokens = { ...existing };
    mergeUsageTokens(tokens, incoming);
    mergeUsageOutcome(tokens, incoming);
    Object.assign(existing, incoming, { promptTokens: tokens.promptTokens, completionTokens: tokens.completionTokens, totalTokens: tokens.totalTokens, success: tokens.success, mediaCount: tokens.mediaCount, billableCount: tokens.billableCount });
    if (reported) { existing.costUsd = reported.costUsd; existing.costRmb = reported.costRmb; existing.costSource = 'reported'; }
    else if (existing.costSource === 'estimated' && !['image', 'video'].includes(existing.type)) {
      existing.costUsd = estimateModelCost(existing.modelId, existing.type, existing);
      existing.costRmb = Number((existing.costUsd * getQuotaToRmbRatio()).toFixed(6));
    }
  }
  return logs.sort((a, b) => b.timestamp - a.timestamp);
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
      const promptTokens = item.promptTokens || 0;
      const completionTokens = item.completionTokens || 0;
      const totalTokens = item.totalTokens || (promptTokens + completionTokens) || 0;
      const taskId = item.taskId?.trim() || undefined;
      const localTaskId = item.localTaskId?.trim() || undefined;
      const scope = item.scope || createUsageScope(item.type, item.modelId);
      // A recovered receipt belongs to the statistics generation captured before dispatch.
      if ((scope.epoch || 'initial') !== currentUsageEpoch()) return;
      const recordId = item.recordId?.trim() || undefined;
      const existing = findUsageLog(logs, { scope, recordId, taskId, localTaskId });
      if (existing) {
        let changed = mergeUsageOutcome(existing, item);
        if (taskId && !existing.taskId) { existing.taskId = taskId; changed = true; }
        if (localTaskId && !existing.localTaskId) { existing.localTaskId = localTaskId; changed = true; }
        if (recordId && !existing.recordId) { existing.recordId = recordId; changed = true; }
        const tokensChanged = mergeUsageTokens(existing, { promptTokens, completionTokens, totalTokens });
        changed ||= tokensChanged;
        if (item.costUsd !== undefined) {
          existing.costUsd = item.costUsd; existing.costRmb = Number((item.costUsd * getQuotaToRmbRatio()).toFixed(6));
          existing.costSource = 'reported'; changed = true;
        } else if (tokensChanged && existing.costSource === 'estimated' && !['image','video'].includes(item.type)) {
          existing.costUsd = estimateModelCost(existing.modelId, existing.type, existing);
          existing.costRmb = Number((existing.costUsd * getQuotaToRmbRatio()).toFixed(6));
        }
        if (item.type === 'video' && item.duration !== undefined) {
          if (existing.costSource === 'estimated') {
          const refreshedCost = Number(estimateModelCost(item.modelId, item.type, {
            mediaCount: existing.mediaCount,
            billableCount: existing.billableCount,
            duration: item.duration,
            resolution: item.resolution,
          }).toFixed(6));
          if (existing.costUsd !== refreshedCost) {
            existing.costUsd = refreshedCost;
            existing.costRmb = Number((refreshedCost * getQuotaToRmbRatio()).toFixed(6));
            changed = true;
          }
          }
          if (item.resolution && existing.resolution !== item.resolution) {
            existing.resolution = item.resolution;
            changed = true;
          }
          if (existing.duration !== item.duration) {
            existing.duration = item.duration;
            changed = true;
          }
        }
        if (changed) saveUsageReceipt(existing);
        return;
      }
      const calculatedCostUsd = item.costUsd !== undefined
        ? item.costUsd
        : estimateModelCost(item.modelId, item.type, {
            promptTokens: item.promptTokens,
            completionTokens: item.completionTokens,
            totalTokens: item.totalTokens,
            mediaCount: item.mediaCount,
            billableCount: item.billableCount,
            duration: item.duration,
            resolution: item.resolution,
          });

      const costUsd = Number(calculatedCostUsd.toFixed(6));
      const ratio = getQuotaToRmbRatio();
      const costRmb = Number((costUsd * ratio).toFixed(6));

      // 提取供应商名称（通过 resolveModelVendor 统一校准）
      const vendor = resolveModelVendor(item.modelId, item.provider);

      const newLog: UsageLogItem = {
        id: 'log_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''),
        timestamp: item.timestamp ?? Date.now(),
        scope,
        ...(recordId ? { recordId } : {}),
        costSource: item.costUsd === undefined ? 'estimated' : 'reported',
        ...(taskId ? { taskId } : {}),
        ...(localTaskId ? { localTaskId } : {}),
        modelId: item.modelId,
        modelName: item.modelName || item.modelId,
        provider: vendor,
        type: item.type,
        promptTokens,
        completionTokens,
        totalTokens,
        ...(item.billableCount !== undefined ? { billableCount: item.billableCount } : {}),
        mediaCount: item.mediaCount ?? ((item.type === 'image' || item.type === 'video') && item.success !== false ? 1 : 0),
        ...(item.duration !== undefined ? { duration: item.duration } : {}),
        ...(item.resolution ? { resolution: item.resolution } : {}),
        costUsd,
        costRmb,
        success: item.success,
        cached: !!item.cached
      };

      saveUsageReceipt(newLog);
    } catch {}
  }
}

/**
 * 清空用量统计日志
 */
export function clearUsageLogs(): void {
  if (typeof window === 'undefined') return;
  clearUsageReceipts();
}

export { type UsageSummary, type UsageRange } from './usageSummary';

export function getUsageSummary(range: UsageRange = '30d'): UsageSummary {
  return buildUsageSummary(getUsageLogs(), getQuotaToRmbRatio(), range);
}
