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
  'bytegoofy.com',
  '365yg.com',
  'amemv.com',
  'ixigua.com',
  'pstatp.com',
  'snssdk.com',
  'tos-cn-i-0000.volccdn.com',
  'volccdn.com',
  'volces.com',
  'kuaishou.com',
  'yximgs.com',
  'kwai.net',
  'kwaicdn.com',
  'kwimgs.com',
  'douyinvod.com',
  'sinaimg.cn',
  'weibo.com',
  't.cn',
  'hdslb.com',
  'bilibili.com',
  'b23.tv',
  'comfly.org',
  'comfly.chat',
  'comfly.net',
  'comfly.io',
  'comfly.ai',
  'comfly.vip',
  'aiproxy.vip',
  'aiproxy.io',
  'api2d.net',
  'openai.com',
  'oaistatic.com',
  'oaiusercontent.com',
  'cloudflare.com',
  'r2.dev',
  'aliyuncs.com',
  'aliyun.com',
  'myqcloud.com',
  'qcloud.com',
  'tencentcloudapi.com',
  'amazonaws.com',
  'googleusercontent.com',
  'ggpht.com',
  'googleapis.com',
  'gstatic.com',
  'meituan.net',
  'mtmos.com',
  'fal.media',
  'fal.ai',
  'replicate.delivery',
  'replicate.com',
  'siliconflow.cn',
  'siliconflow.com',
  'bcebos.com',
  'baidubce.com',
  'pollinations.ai',
  'cloudfront.net',
  'fastly.net',
  '1688.com',
  'tbcdn.cn',
  'bytedance.com',
  'volcengine.com',
  'byteffectser.com',
  'ibyteimg.com',
  'zijieapi.com',
  'myhuaweicloud.com',
  'qiniucdn.com',
  'qbox.me',
  'clouddn.com',
  'upaiyun.com',
  'gifshow.com',
  'hutaojie.com',
  'jcloudcs.com',
  'douyincdn.com',
  'bytefcdn.com',
  'bytefcdn-oversea.com',
  // GitHub 精选技能库拉取（索引 / raw 文件）
  'github.com',
  'githubusercontent.com',
  'raw.githubusercontent.com',
  'api.github.com',
  'objects.githubusercontent.com',
];

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
]);

export function isPrivateIp(ip: string): boolean {
  const raw = ip.replace(/^\[|\]$/g, '').toLowerCase();
  const mapped = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (mapped === '::1' || mapped === '0.0.0.0') return true;
  if (mapped.startsWith('fe80:') || mapped.startsWith('fc') || mapped.startsWith('fd')) return true;
  if (!net.isIP(mapped) && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) {
    return net.isIP(ip) ? ip === '127.0.0.1' || ip === '::1' || ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd') : false;
  }
  const host = mapped;
  if (host === '127.0.0.1' || host === '::1') return true;
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  }
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && parts[2] <= 2) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  return false;
}

export function isAllowedRemoteHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTS.has(host)) return false;
  if (host === '0.0.0.0' || isPrivateIp(host)) return false;

  // 1. 允许系统配置的对象存储自定义公共域名及 Endpoint 主机
  try {
    const configuredDomains = [
      process.env.S3_PUBLIC_DOMAIN,
      process.env.S3_ENDPOINT,
      process.env.R2_PUBLIC_DOMAIN,
    ].filter(Boolean) as string[];
    for (const raw of configuredDomains) {
      const clean = raw.trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
      if (clean && (host === clean || host.endsWith('.' + clean))) {
        return true;
      }
    }
  } catch {
    // ignore
  }

  // 2. 允许内置标准合法业务域名白名单
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith('.' + suffix)
  );
}

const dnsCache = new Map<string, { ok: boolean; error?: string; at: number }>();
const DNS_CACHE_TTL_MS = 10 * 60 * 1000;

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
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || isPrivateIp(hostname)) {
    throw new Error('Host not allowed');
  }
  if (opts.requireAllowlist && !isAllowedRemoteHost(hostname)) {
    throw new Error(`Host not allowed: ${hostname}`);
  }

  // 检查 DNS 高速缓存
  const cachedDns = dnsCache.get(hostname);
  if (cachedDns && Date.now() - cachedDns.at < DNS_CACHE_TTL_MS) {
    if (!cachedDns.ok) throw new Error(cachedDns.error || 'Host verification failed');
    return parsed;
  }

  try {
    const records = await lookup(hostname, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        dnsCache.set(hostname, { ok: false, error: 'Resolved to private IP', at: Date.now() });
        throw new Error('Resolved to private IP');
      }
    }
    dnsCache.set(hostname, { ok: true, at: Date.now() });
  } catch (e: any) {
    const errMsg = String(e?.message || '');
    if (errMsg.includes('private') || errMsg.includes('not allowed')) {
      dnsCache.set(hostname, { ok: false, error: errMsg, at: Date.now() });
      throw e;
    }
    dnsCache.set(hostname, { ok: false, error: 'DNS lookup failed for host', at: Date.now() });
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
  const publicRoots = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), 'apps/web/public'),
    path.resolve(process.cwd(), '../web/public'),
  ];
  for (const publicRoot of publicRoots) {
    const fromPublic = resolveUnderRoot(publicRoot, relative);
    if (fromPublic) return fromPublic;
  }

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
