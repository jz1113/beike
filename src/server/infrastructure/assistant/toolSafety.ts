import { formatUserError } from '@shared/domain/models/upstreamErrors';

/** Tool failures are data for both the UI and model; never include storage paths or credentials. */
export function formatToolError(error: unknown, fallback = '工具执行失败，请稍后重试'): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/prisma|sqlite|sql\b|\bat\s+\S+\s*\(|(?:\/Users\/|\/home\/|\/private\/|\/tmp\/|[a-z]:[\\/])/i.test(raw)) return fallback;
  let message = formatUserError(error, fallback);
  for (const [name, value] of Object.entries(process.env)) {
    if (value && value.length >= 8 && /(?:key|token|secret|password)/i.test(name)) message = message.split(value).join('[已隐藏凭证]');
  }
  return message.replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [已隐藏凭证]')
    .replace(/\bsk-[a-z0-9_-]{8,}/gi, '[已隐藏凭证]')
    .replace(/([?&](?:api_?key|token|secret|signature|credential|access_?key)=)[^&\s"<>]+/gi, '$1[已隐藏凭证]').slice(0, 240) || fallback;
}
