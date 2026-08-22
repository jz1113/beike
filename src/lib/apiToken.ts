const TOKEN_STORAGE_KEY = 'app_access_token';
const DEFAULT_DEV_TOKEN = 'azhuo-local-dev';

export function getClientAccessToken(): string {
  if (typeof window === 'undefined') return DEFAULT_DEV_TOKEN;
  try {
    const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  return import.meta.env.VITE_APP_ACCESS_TOKEN?.trim() || DEFAULT_DEV_TOKEN;
}

export function setClientAccessToken(token: string) {
  if (typeof window === 'undefined') return;
  const v = token.trim();
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, v);
    document.cookie = `app_token=${encodeURIComponent(v)}; path=/; SameSite=Lax; Max-Age=31536000`;
  } catch {}
}

export function syncAppTokenCookie() {
  if (typeof window === 'undefined') return;
  try {
    const v = getClientAccessToken();
    document.cookie = `app_token=${encodeURIComponent(v)}; path=/; SameSite=Lax; Max-Age=31536000`;
  } catch {}
}
