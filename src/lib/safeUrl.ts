import path from 'path';
import fs from 'fs';
import { lookup } from 'dns/promises';
import net from 'net';

const ALLOWED_HOST_SUFFIXES = [
  'alicdn.com',
  'taobaocdn.com',
  'taobao.com',
  'tmall.com',
  'jd.com',
  '360buyimg.com',
  'yangkeduo.com',
  'pddpic.com',
  'pinduoduo.com',
  'xiaohongshu.com',
  'xhscdn.com',
  'xhslink.com',
  'fengkongcloud.com',
  'douyin.com',
  'douyinpic.com',
  'iesdouyin.com',
  'byteimg.com',
  'bytecdn.cn',
  'pstatp.com',
  'snssdk.com',
  'tos-cn-i-0000.volccdn.com',
  'volccdn.com',
  'volces.com',
  'kuaishou.com',
  'yximgs.com',
  'kwai.net',
  'sinaimg.cn',
  'weibo.com',
  't.cn',
  'hdslb.com',
  'bilibili.com',
  'b23.tv',
  'comfly.org',
  'aiproxy.vip',
  'openai.com',
  'oaistatic.com',
  'oaiusercontent.com',
  'cloudflare.com',
  'r2.dev',
  'aliyuncs.com',
  'myqcloud.com',
  'amazonaws.com',
  'googleusercontent.com',
  'ggpht.com',
  'googleapis.com',
  'gstatic.com',
  'meituan.net',
  'mtmos.com',
];

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
]);

export function isPrivateIp(ip: string): boolean {
  if (!net.isIP(ip)) return false;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true;
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
  return false;
}

export function isAllowedRemoteHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTS.has(host)) return false;
  if (host === '0.0.0.0' || isPrivateIp(host)) return false;
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith('.' + suffix)
  );
}

export async function assertSafeRemoteUrl(
  rawUrl: string,
  opts: { requireAllowlist?: boolean } = {}
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http(s) URLs allowed');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('Only https URLs allowed in production');
  }
  if (BLOCKED_HOSTS.has(parsed.hostname.toLowerCase()) || isPrivateIp(parsed.hostname)) {
    throw new Error('Host not allowed');
  }
  if (opts.requireAllowlist && !isAllowedRemoteHost(parsed.hostname)) {
    throw new Error(`Host not allowed: ${parsed.hostname}`);
  }
  try {
    const records = await lookup(parsed.hostname, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error('Resolved to private IP');
      }
    }
  } catch (e: any) {
    if (String(e?.message || '').includes('private') || String(e?.message || '').includes('not allowed')) throw e;
    throw new Error('DNS lookup failed for host');
  }
  return parsed;
}

function resolveUnderRoot(root: string, relative: string): string | null {
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return null;
  }
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

/** 将相对路径安全解析到 public 或桌面数据目录内，阻止路径穿越 */
export function resolvePublicPath(relUrl: string): string | null {
  const cleanPath = relUrl.split('?')[0].split('#')[0];
  const relative = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
  const publicRoot = path.resolve(process.cwd(), 'public');
  const fromPublic = resolveUnderRoot(publicRoot, relative);
  if (fromPublic) return fromPublic;

  const dataDir = process.env.AZHUO_DATA_DIR?.trim();
  if (dataDir) {
    const cacheRoot = process.env.AZHUO_CACHE_DIR?.trim() || path.join(dataDir, 'storage');
    const storageRoot = path.resolve(cacheRoot);
    const fromData = resolveUnderRoot(storageRoot, relative.replace(/^storage\/?/, ''));
    if (fromData) return fromData;
    const fromDataRoot = resolveUnderRoot(path.resolve(dataDir), relative);
    if (fromDataRoot) return fromDataRoot;
  }
  return null;
}

export const MAX_PROXY_BYTES = 25 * 1024 * 1024; // 25MB
