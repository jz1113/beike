const STORAGE_KEY = 'beike_workspace_secret';
const COOKIE_NAME = 'beike_workspace';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      try {
        return decodeURIComponent(trimmed.slice(target.length));
      } catch {
        return trimmed.slice(target.length);
      }
    }
  }
  return null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

export function getWorkspaceSecret(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem(STORAGE_KEY)?.trim();
    if (stored && stored.length >= 32) return stored;
  } catch {
    /* storage disabled */
  }

  const fromCookie = readCookie(COOKIE_NAME)?.trim();
  const secret = fromCookie && fromCookie.length >= 32 ? fromCookie : randomSecret();
  try {
    localStorage.setItem(STORAGE_KEY, secret);
  } catch {
    /* ignore */
  }
  writeCookie(COOKIE_NAME, secret);
  return secret;
}

export function syncWorkspaceCookie(): void {
  const secret = getWorkspaceSecret();
  if (secret) writeCookie(COOKIE_NAME, secret);
}
