const permanentHostSuffixes = ['r2.dev', 'aliyuncs.com', 'myqcloud.com', 'amazonaws.com', 'amazonaws.com.cn'];
const temporaryQueryKeys = new Set([
  'signature', 'sig', 'sign', 'expires', 'expiry', 'token', 'auth_key',
  'awsaccesskeyid', 'ossaccesskeyid', 'securitytoken', 'security-token',
  'x-amz-algorithm', 'x-amz-credential', 'x-amz-date', 'x-amz-expires',
  'x-amz-signedheaders', 'x-amz-signature', 'x-amz-security-token',
  'x-oss-signature', 'x-oss-signature-version', 'x-oss-credential',
  'x-oss-date', 'x-oss-expires', 'x-oss-security-token',
  'q-signature', 'q-sign-algorithm', 'q-sign-time', 'q-key-time', 'q-ak',
  'x-cos-security-token',
]);

function publicHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed;
  } catch { return null; }
}

/** Signed/expiring URLs must be copied even when they belong to a storage provider. */
export function isPermanentStorageUrl(value: string, publicDomain?: string): boolean {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith('/storage/')) {
    try {
      const local = new URL(value, 'http://local-storage.invalid');
      const path = decodeURIComponent(local.pathname);
      return path.startsWith('/storage/') && path !== '/storage/' &&
        !path.split('/').some((part) => part === '.' || part === '..') &&
        ![...local.searchParams.keys()].some((key) => temporaryQueryKeys.has(key.toLowerCase()));
    } catch { return false; }
  }
  const url = publicHttpUrl(value);
  if (!url) return false;
  for (const key of url.searchParams.keys()) {
    if (temporaryQueryKeys.has(key.toLowerCase())) return false;
  }
  if (publicDomain) {
    const base = publicHttpUrl(publicDomain);
    if (base && !base.search && !base.hash) {
      const path = base.pathname.replace(/\/+$/, '');
      if (url.origin === base.origin) return url.pathname === path || url.pathname.startsWith(`${path}/`);
    }
  }
  return permanentHostSuffixes.some((suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
}
