/**
 * 客户端访问令牌工具。
 *
 * 安全约定：
 * - localStorage 仅保存 **过期时间元数据**（key 前缀 `app_token_meta_`）；
 *   不再保存真实 token 明文。
 * - 生产 app_token 由后端签发为 HttpOnly Cookie，浏览器随同源请求发送。
 * - 开发环境从 Vite 注入或客户端 Cookie 取得令牌，并构造 API 请求头。
 * - 托管入口依赖 HTTPS、Nginx 网页认证和 Go 端口隔离，应用 token 不单独充当登录边界。
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
    try { localStorage.removeItem(`${TOKEN_META_PREFIX}expires_at`); } catch { /* ignore */ }
    writeCookie(TOKEN_COOKIE_NAME, '', 0);
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
 * 同步客户端可读 Cookie 与过期时间元数据；保持当前请求头认证方式。
 */
export function setClientAccessToken(_token: string): void {
  if (typeof window === 'undefined') return;
  writeMeta();
  // 当前 API 需要读取 Cookie 生成请求头，不能单独改成 HttpOnly。
  writeCookie(TOKEN_COOKIE_NAME, _token.trim(), TOKEN_TTL_SECONDS);
}

export function syncAppTokenCookie(): void {
  if (typeof window === 'undefined' || import.meta.env.PROD) return;
  const token = getClientAccessToken();
  if (!token) {
    writeCookie(TOKEN_COOKIE_NAME, '', 0);
    return;
  }
  if (!readMeta()) {
    writeMeta();
  }
  if (token !== DEFAULT_DEV_TOKEN) {
    writeCookie(TOKEN_COOKIE_NAME, token, TOKEN_TTL_SECONDS);
  }
}
