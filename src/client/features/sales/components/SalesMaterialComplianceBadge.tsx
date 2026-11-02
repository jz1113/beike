import { LoaderCircle, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react';
import { runSeedancePrecheck, useSeedancePrecheck, type SeedancePrecheckItemInput } from '@client/shared/api/generation/seedancePrecheck';

export function SalesMaterialComplianceBadge({ url, mediaType }: SeedancePrecheckItemInput) {
  const item = { url: url.trim(), mediaType };
  // Reading the library observes checks made during conversion or use; it never uploads the whole library.
  const entries = useSeedancePrecheck(item.url ? [item] : [], false);
  const entry = entries.get(item.url);
  if (!item.url) return null;
  const status = entry?.status || 'unchecked';
  const label = status === 'passed' ? '已通过合规校验' : status === 'rejected' ? '合规校验未通过'
    : status === 'verifying' ? '正在校验' : '待校验';
  const Icon = status === 'passed' ? ShieldCheck : status === 'rejected' ? ShieldX
    : status === 'verifying' ? LoaderCircle : ShieldQuestion;
  const canCheck = status === 'unchecked' || status === 'skipped';
  const details = [
    `Seedance：${label}`,
    entry?.width && entry?.height ? `${entry.width} × ${entry.height}` : '',
    entry?.durationSec ? `${entry.durationSec.toFixed(1)} 秒` : '',
    entry?.error || '',
    canCheck ? '点击开始校验' : '',
  ].filter(Boolean).join('\n');
  const className = `sales-material-compliance is-${status}`;
  const icon = <Icon size={15} aria-hidden className={status === 'verifying' ? 'animate-spin' : undefined} />;
  return canCheck ? (
    <button type="button" className={className} title={details} aria-label={details}
      onClick={() => { void runSeedancePrecheck([item]); }}>{icon}</button>
  ) : (
    <span className={className} role="img" tabIndex={0} title={details} aria-label={details}>{icon}</span>
  );
}
