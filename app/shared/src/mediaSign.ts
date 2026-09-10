import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_SEC = 300;

export function createMediaSignature(
  rawUrl: string,
  secret: string,
  ttlSec = DEFAULT_TTL_SEC,
): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${rawUrl}\n${exp}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return { exp, sig };
}

export function verifyMediaSignature(
  rawUrl: string,
  exp: number,
  sig: string,
  secret: string,
): boolean {
  if (!rawUrl || !sig || !Number.isFinite(exp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (exp < now) return false;
  const expected = createHmac('sha256', secret).update(`${rawUrl}\n${exp}`).digest('hex');
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function appendMediaSignature(url: string, rawMediaUrl: string, secret: string): string {
  const { exp, sig } = createMediaSignature(rawMediaUrl, secret);
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}exp=${exp}&sig=${sig}`;
}
