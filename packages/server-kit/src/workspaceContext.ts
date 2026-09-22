import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

export const LOCAL_WORKSPACE_ID = 'local';
export const OFFICIAL_WORKSPACE_ID = 'official';
export const LEGACY_WORKSPACE_ID = 'legacy';
export const WORKSPACE_HEADER = 'x-workspace-token';
export const WORKSPACE_COOKIE = 'beike_workspace';
export const MIN_WORKSPACE_SECRET_LENGTH = 32;

export class WorkspaceRequiredError extends Error {
  readonly status = 401;
  constructor(message = '缺少工作区密钥') {
    super(message);
    this.name = 'WorkspaceRequiredError';
  }
}

export type WorkspaceStore = {
  workspaceId: string;
  secret?: string;
};

const storage = new AsyncLocalStorage<WorkspaceStore>();

export function isFixedLocalWorkspace(): boolean {
  return process.env.DESKTOP_SHELL === '1' || process.env.NODE_ENV !== 'production';
}

export function isSharedWebDeployment(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.DESKTOP_SHELL !== '1';
}

export function hashWorkspaceSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function getWorkspaceStore(): WorkspaceStore | undefined {
  return storage.getStore();
}

export function getWorkspaceId(): string | undefined {
  return storage.getStore()?.workspaceId;
}

export function requireWorkspaceId(): string {
  const id = getWorkspaceId();
  if (!id) throw new WorkspaceRequiredError('缺少工作区上下文');
  return id;
}

export function runWithWorkspace<T>(workspaceId: string, fn: () => T, secret?: string): T {
  const store: WorkspaceStore = { workspaceId, secret };
  return storage.run(store, () => {
    const result = fn();
    if (result && typeof (result as { then?: unknown }).then === 'function') {
      return (async () => {
        return await result;
      })() as T;
    }
    return result;
  });
}

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function extractWorkspaceSecret(req: Request): string {
  return (req.headers.get(WORKSPACE_HEADER) || readCookie(req, WORKSPACE_COOKIE) || '').trim();
}

export function resolveWorkspaceFromRequest(req: Request): { ok: true; store: WorkspaceStore } | { ok: false; status: 401; error: string } {
  if (isFixedLocalWorkspace()) {
    return { ok: true, store: { workspaceId: LOCAL_WORKSPACE_ID } };
  }

  const secret = extractWorkspaceSecret(req);
  if (secret.length < MIN_WORKSPACE_SECRET_LENGTH) {
    return { ok: false, status: 401 as const, error: '缺少工作区密钥' };
  }
  return { ok: true, store: { workspaceId: hashWorkspaceSecret(secret), secret } };
}

export function runWithRequestWorkspace<T>(req: Request, fn: () => T): T {
  const resolved = resolveWorkspaceFromRequest(req);
  if (!resolved.ok) throw new WorkspaceRequiredError(resolved.error);
  return runWithWorkspace(resolved.store.workspaceId, fn, resolved.store.secret);
}
