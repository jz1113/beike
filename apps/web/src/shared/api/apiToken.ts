/**
 * 客户端访问令牌工具。
 *
 * 安全约定：
 * - localStorage 仅保存 **过期时间元数据**（key 前缀 `app_token_meta_`）；
 *   不再保存真实 token 明文。
 * - 真实 token 通过 document.cookie 由后端 Set-Cookie 下发（HttpOnly 模式下由后端保证，
 *   此处仅作为同步兼容层保留 SameSite=Lax 写入以支持旧版部署）。
 * - 兼容旧部署：读取时若发现 localStorage 中存在旧 token，会在读取后立即清除并仅保留过期元数据。
 */

const TOKEN_COOKIE_NAME = 'app_token';
const TOKEN_META_PREFIX = 'app_token_meta_';
const DEFAULT_DEV_TOKEN = 'azhuo-local-dev';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天

interface TokenMeta {
  expiresAt: number;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

function readMeta(): TokenMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${TOKEN_META_PREFIX}expires_at`);
    if (!raw) return null;
    const expiresAt = Number(raw);
    if (!Number.isFinite(expiresAt)) return null;
    return { expiresAt };
  } catch {
    return null;
  }
}

function writeMeta(): void {
  if (typeof window === 'undefined') return;
  try {
    const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
    localStorage.setItem(`${TOKEN_META_PREFIX}expires_at`, String(expiresAt));
  } catch {
    /* storage disabled */
  }
}

/**
 * 一次性清理历史 localStorage 中遗留的明文 token（防御旧部署残留）
 */
function clearLegacyToken(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('app_access_token');
  } catch {
    /* ignore */
  }
}

/**
 * 获取客户端访问令牌（按优先级）：
 *   1. Cookie
 *   2. import.meta.env.VITE_APP_ACCESS_TOKEN（仅 dev 注入）
 *   3. DEFAULT_DEV_TOKEN 兜底（仅 dev 场景）
 *
 * 同时校验过期时间，过期则返回空串供上层重新拉取。
 */
export function getClientAccessToken(): string {
  if (typeof window === 'undefined') return DEFAULT_DEV_TOKEN;
  clearLegacyToken();

  const meta = readMeta();
  if (meta && meta.expiresAt > 0 && Date.now() > meta.expiresAt) {
    return '';
  }

  const envToken = import.meta.env.VITE_APP_ACCESS_TOKEN?.trim();
  // 本机 Vite 开发服务与 API 共用脚本生成的短期令牌。若浏览器残留了
  // 上一次启动留下的 Cookie，必须由当前开发令牌覆盖，否则 API 重启后会
  // 出现“服务可用但所有接口 401”的假故障。
  if (import.meta.env.DEV && envToken) {
    const cookieToken = readCookie(TOKEN_COOKIE_NAME)?.trim();
    if (cookieToken !== envToken) writeCookie(TOKEN_COOKIE_NAME, envToken, TOKEN_TTL_SECONDS);
    return envToken;
  }

  const cookieToken = readCookie(TOKEN_COOKIE_NAME);
  if (cookieToken && cookieToken.trim()) return cookieToken.trim();

  if (envToken) return envToken;

  return DEFAULT_DEV_TOKEN;
}

/**
 * 由后端 Set-Cookie 下发；此处仅同步过期时间元数据
 */
export function setClientAccessToken(_token: string): void {
  if (typeof window === 'undefined') return;
  writeMeta();
  // 后端应当通过 Set-Cookie 写入 HttpOnly Cookie；此处保留兼容旧版的能力
  writeCookie(TOKEN_COOKIE_NAME, _token.trim(), TOKEN_TTL_SECONDS);
}

export function syncAppTokenCookie(): void {
  if (typeof window === 'undefined') return;
  writeMeta();
  const token = getClientAccessToken();
  if (token && token !== DEFAULT_DEV_TOKEN) {
    writeCookie(TOKEN_COOKIE_NAME, token, TOKEN_TTL_SECONDS);
  }
}
