/**
 * desktop_api IPC 路径白名单测试
 *
 * 由于 Rust 实现无法在 Node 中直接跑，这里用镜像的 JS 函数结构验证白名单逻辑。
 * 一旦 Rust 侧 validate_incoming_path / forward 拼装改变，必须同步更新此处。
 */
import { describe, it, expect } from 'vitest';

const ALLOWED_PREFIXES = ['/api/', '/storage/'];
const FORBIDDEN_HEADERS = ['host', 'connection', 'content-length', 'transfer-encoding'];
const MAX_PATH_LEN = 1024;
const MAX_BODY_LEN = 8 * 1024 * 1024;

function validateIncomingPath(path: string): { ok: boolean; error?: string } {
  if (!path) return { ok: false, error: '缺少 path' };
  if (path.length > MAX_PATH_LEN) {
    return { ok: false, error: `路径长度超过限制 (最大 ${MAX_PATH_LEN} 字节)` };
  }
  if (path.includes('..')) return { ok: false, error: `路径包含非法片段: ${path}` };
  if (!path.startsWith('/')) return { ok: false, error: `path 必须以 / 开头: ${path}` };
  if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
    return { ok: false, error: `path 不在白名单: ${path}` };
  }
  return { ok: true };
}

function validateIncomingUrl(url: string): { ok: boolean; error?: string } {
  if (!url || url.startsWith('/')) return { ok: true };
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: `禁止的协议: ${u.protocol}` };
    }
    const host = u.hostname.toLowerCase();
    const allowed =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0' ||
      host === 'host.docker.internal';
    if (!allowed) return { ok: false, error: `禁止外部域名: ${host}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `URL 解析失败: ${(e as Error).message}` };
  }
}

/** 镜像 extract_url_path_and_query + target 拼装：path 一律用已校验的 req.path */
function buildSidecarTarget(
  apiPort: number,
  reqPath: string,
  reqUrl: string,
): { ok: true; target: string } | { ok: false; error: string } {
  const urlCheck = validateIncomingUrl(reqUrl);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error || 'url 非法' };

  const pathCheck = validateIncomingPath(reqPath);
  if (!pathCheck.ok) return { ok: false, error: pathCheck.error || 'path 非法' };

  let urlPath: string | null = null;
  let query = '';
  if (reqUrl) {
    if (reqUrl.startsWith('/')) {
      const [pathPart, queryPart] = reqUrl.split('?');
      urlPath = pathPart;
      query = queryPart !== undefined ? `?${queryPart}` : '';
    } else {
      try {
        const u = new URL(reqUrl);
        query = u.search || '';
        if (u.pathname && u.pathname !== '/') urlPath = u.pathname;
      } catch (e) {
        return { ok: false, error: `URL 解析失败: ${(e as Error).message}` };
      }
    }
  }

  if (urlPath) {
    const urlPathCheck = validateIncomingPath(urlPath);
    if (!urlPathCheck.ok) return { ok: false, error: urlPathCheck.error || 'url.path 非法' };
  }

  return { ok: true, target: `http://127.0.0.1:${apiPort}${reqPath}${query}` };
}

function validateBodyLen(body: string | null | undefined): { ok: boolean; error?: string } {
  if (body == null) return { ok: true };
  if (body.length > MAX_BODY_LEN) {
    return { ok: false, error: `请求体超过限制 (最大 ${MAX_BODY_LEN / (1024 * 1024)}MB)` };
  }
  return { ok: true };
}

describe('desktop_api IPC 路径安全', () => {
  describe('path 白名单', () => {
    it.each([
      '/api/health',
      '/api/system/config',
      '/api/generate/image',
      '/storage/safe.jpg',
    ])('允许白名单 path: %s', (p) => {
      expect(validateIncomingPath(p).ok).toBe(true);
    });

    it.each([
      '',
      '/',
      '/etc/passwd',
      '/admin',
      '/api../',
      '../api/health',
      '/api/../../../etc/passwd',
      '/APi/health',
    ])('拒绝非法 path: %s', (p) => {
      expect(validateIncomingPath(p).ok).toBe(false);
    });

    it('拒绝超长 path', () => {
      const long = `/api/${'a'.repeat(MAX_PATH_LEN)}`;
      expect(validateIncomingPath(long).ok).toBe(false);
    });
  });

  describe('url 校验', () => {
    it.each([
      'http://127.0.0.1:3000/api/health',
      'https://localhost/api/health',
      'http://host.docker.internal:3000/api/health',
    ])('允许 localhost url: %s', (u) => {
      expect(validateIncomingUrl(u).ok).toBe(true);
    });

    it.each([
      'http://example.com/api/health',
      'https://evil.example.com',
      'file:///etc/passwd',
      'ftp://localhost/',
    ])('拒绝外部/异常 url: %s', (u) => {
      expect(validateIncomingUrl(u).ok).toBe(false);
    });

    it('空字符串视为合法（使用 path 兜底）', () => {
      expect(validateIncomingUrl('').ok).toBe(true);
    });

    it.each([
      '/api/generate/image',
      '/api/health',
      '/storage/demo.jpg',
    ])('允许相对路径 url: %s', (u) => {
      expect(validateIncomingUrl(u).ok).toBe(true);
    });
  });

  describe('body 长度限制', () => {
    it('允许空 body', () => {
      expect(validateBodyLen(null).ok).toBe(true);
      expect(validateBodyLen(undefined).ok).toBe(true);
      expect(validateBodyLen('').ok).toBe(true);
    });

    it('拒绝超大 body', () => {
      expect(validateBodyLen('x'.repeat(MAX_BODY_LEN + 1)).ok).toBe(false);
    });
  });

  describe('forward target 拼装（防白名单绕过）', () => {
    it('相对 url 带 query 时仍使用 req.path，不采纳 url 中的非法 path', () => {
      const r = buildSidecarTarget(39111, '/api/health', '/internal/secret?x=1');
      expect(r.ok).toBe(false);
    });

    it('相对 url 合法 path + query 时 target 用 req.path + query', () => {
      const r = buildSidecarTarget(39111, '/api/generate/image', '/api/generate/image?taskId=abc');
      expect(r).toEqual({
        ok: true,
        target: 'http://127.0.0.1:39111/api/generate/image?taskId=abc',
      });
    });

    it('绝对 localhost url 的 path 非法时拒绝（即使 req.path 合法）', () => {
      const r = buildSidecarTarget(39111, '/api/health', 'http://127.0.0.1:39111/admin/secret');
      expect(r.ok).toBe(false);
    });

    it('绝对 localhost url 合法时 target 仍用 req.path（忽略 url path 差异中的端口）', () => {
      const r = buildSidecarTarget(
        39111,
        '/api/health',
        'http://127.0.0.1:9999/api/health?ping=1',
      );
      expect(r).toEqual({
        ok: true,
        target: 'http://127.0.0.1:39111/api/health?ping=1',
      });
    });

    it('空 url 时仅用 safe path', () => {
      const r = buildSidecarTarget(39111, '/api/health', '');
      expect(r).toEqual({
        ok: true,
        target: 'http://127.0.0.1:39111/api/health',
      });
    });
  });

  describe('禁止的 header', () => {
    it('FORBIDDEN_HEADERS 应当包含常见敏感字段', () => {
      for (const h of ['host', 'connection', 'content-length', 'transfer-encoding']) {
        expect(FORBIDDEN_HEADERS).toContain(h);
      }
    });
  });
});
