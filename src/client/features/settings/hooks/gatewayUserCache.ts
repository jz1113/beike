import type { GatewayUserInfo } from '../model/gatewayUserTypes';

const numericFields = ['quota', 'usedQuota', 'quotaFormatted', 'quotaRmb', 'usedQuotaFormatted', 'usedQuotaRmb', 'remainingPercent', 'requestCount'] as const;

export function isGatewayUserInfo(value: unknown): value is GatewayUserInfo {
  if (!value || typeof value !== 'object') return false;
  const user = value as Record<string, unknown>;
  return (typeof user.id === 'string' || typeof user.id === 'number')
    && typeof user.username === 'string' && typeof user.displayName === 'string'
    && ['balanceAvailable', 'usageAvailable'].every((field) => user[field] === undefined || typeof user[field] === 'boolean')
    && numericFields.every((field) => typeof user[field] === 'number' && Number.isFinite(user[field]));
}

export function gatewayAccountKey(userId: string, baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '').replace(/\/v1$/i, '')}|${userId.trim()}`;
}

export function readGatewayCache(raw: string | null, accountKey: string, now = Date.now()) {
  try {
    const cached = JSON.parse(raw || 'null');
    if (cached?.accountKey !== accountKey || !isGatewayUserInfo(cached.user)
      || !Number.isFinite(cached.updatedAt) || cached.updatedAt > now || cached.updatedAt <= 0) return null;
    return { user: cached.user as GatewayUserInfo, updatedAt: cached.updatedAt as number };
  } catch { return null; }
}
