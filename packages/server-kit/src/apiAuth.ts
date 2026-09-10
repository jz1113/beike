const DEV_DEFAULT_TOKEN = 'azhuo-local-dev';

/** 本地/内网访问令牌；生产必须设置 LOCAL_ACCESS_TOKEN，禁止回落到开发默认值 */
export function getAccessToken(): string | null {
  const fromEnv = process.env.LOCAL_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') return null;
  return DEV_DEFAULT_TOKEN;
}

/** 管理员令牌；未配置时返回 null，禁止回退到普通 access token */
export function getAdminToken(): string | null {
  const admin = process.env.ADMIN_ACCESS_TOKEN?.trim();
  return admin || null;
}

/** 生产未配置令牌时拒绝一切 API */
export function isAccessTokenConfigured(): boolean {
  return getAccessToken() !== null;
}

export function extractRequestToken(req: Request): string | null {
  const headers = req.headers;
  const headerToken =
    headers.get('x-app-token') ||
    headers.get('x-access-token') ||
    '';
  if (headerToken.trim()) return headerToken.trim();

  const auth = headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }

  const cookie = headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)app_token=([^;]+)/);
  if (match?.[1]) {
    try { return decodeURIComponent(match[1]); } catch { return null; }
  }

  return null;
}

export function isAuthorized(req: Request): boolean {
  const expected = getAccessToken();
  if (!expected) return false;
  const token = extractRequestToken(req);
  if (!token) return false;
  const admin = getAdminToken();
  if (token === expected || (Boolean(admin) && token === admin)) {
    return true;
  }
  if (process.env.NODE_ENV !== 'production' && token === DEV_DEFAULT_TOKEN) {
    return true;
  }
  return false;
}

export function isAdminAuthorized(req: Request): boolean {
  if (process.env.NODE_ENV !== 'production' || process.env.DESKTOP_SHELL === '1') {
    return isAuthorized(req);
  }
  const admin = getAdminToken();
  if (!admin) return false;
  const token = extractRequestToken(req);
  return Boolean(token && token === admin);
}

export function unauthorizedJson(message = '未授权：访问令牌缺失或无效') {
  return Response.json({ success: false, error: message }, { status: 401 });
}

/** 服务端内部互调时使用的请求头 */
export function getInternalApiHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra || {});
  const token = getAccessToken();
  if (token && !headers.has('x-app-token')) {
    headers.set('x-app-token', token);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}
