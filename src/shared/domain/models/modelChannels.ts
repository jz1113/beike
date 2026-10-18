/**
 * Channel display registry. Add a line here when a new provider is wired in.
 * Official APIs show 「官方」. Gateways show `badge`, or the uppercased first
 * letter of the channel id when no badge is set. Give an explicit badge when
 * two gateways would otherwise share a letter.
 */
export type ChannelKind = 'official' | 'gateway';

export interface ModelChannelMeta {
  name: string;
  kind: ChannelKind;
  badge?: string;
}

export const MODEL_CHANNEL_META: Record<string, ModelChannelMeta> = {
  comfly: { name: 'Comfly 网关', kind: 'gateway' },
  lianchi: { name: '联池图像', kind: 'gateway' },
  deepseek: { name: 'DeepSeek 官方', kind: 'official' },
  openai: { name: 'OpenAI / Responses', kind: 'official' },
};

export function channelDisplayName(channel?: string): string {
  const id = channel?.trim() || '';
  if (!id) return '';
  return MODEL_CHANNEL_META[id]?.name || id;
}

/** Short suffix for model triggers: 官方, an explicit badge, or one capital letter. */
export function channelBadge(channel?: string): string {
  const id = channel?.trim() || '';
  const meta = id ? MODEL_CHANNEL_META[id] : undefined;
  if (meta?.kind === 'official') return '官方';
  if (meta?.badge) return meta.badge;
  const letter = id.match(/[A-Za-z0-9]/)?.[0] ?? id.charAt(0);
  return letter ? letter.toUpperCase() : '';
}
