function nonnegativeAmount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function gatewayBillingDates(now = new Date(), timeZone = 'Asia/Shanghai') {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  }
  const part = (type: string) => parts.find(value => value.type === type)?.value || '';
  return { startDate: `${part('year')}-01-01`, endDate: `${part('year')}-${part('month')}-${part('day')}` };
}

export function gatewayBillingAmounts(hardLimitUsd: unknown, totalUsageCents: unknown) {
  const limit = nonnegativeAmount(hardLimitUsd);
  const cents = nonnegativeAmount(totalUsageCents);
  const usageAvailable = cents !== null;
  const balanceAvailable = limit !== null && usageAvailable;
  const usedQuotaFormatted = cents === null ? 0 : Number((cents / 100).toFixed(2));
  const quotaFormatted = balanceAvailable ? Number(Math.max(0, limit! - usedQuotaFormatted).toFixed(2)) : 0;
  const total = quotaFormatted + usedQuotaFormatted;
  return {
    usageAvailable,
    balanceAvailable,
    quotaFormatted,
    usedQuotaFormatted,
    quotaRmb: Number((quotaFormatted * 1.2).toFixed(2)),
    usedQuotaRmb: Number((usedQuotaFormatted * 1.2).toFixed(2)),
    remainingPercent: balanceAvailable && total > 0 ? Math.min(100, Math.max(0, Math.round(quotaFormatted / total * 100))) : 0,
  };
}
