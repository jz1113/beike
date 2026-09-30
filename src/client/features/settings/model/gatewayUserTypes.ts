export interface GatewayUserInfo {
  id: number | string;
  username: string;
  displayName: string;
  email?: string;
  quota: number;
  usedQuota: number;
  quotaFormatted: number;
  quotaRmb: number;
  usedQuotaFormatted: number;
  usedQuotaRmb: number;
  remainingPercent: number;
  balanceAvailable?: boolean;
  usageAvailable?: boolean;
  requestCount: number;
  group: string;
}
