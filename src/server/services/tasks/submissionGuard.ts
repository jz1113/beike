import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getWorkspaceId, requireWorkspaceId } from '@server/infrastructure/workspace/workspaceContext';

const inFlight = new Map<string, Promise<Response>>();
export const SUBMISSION_RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
interface Receipt { fingerprint: string; kind?: string; status?: number; body?: string; createdAt: number; attemptId?: string }

async function withKeywordReceiptMeta(response: Response, kind: string, attemptId: string | undefined, replayed: boolean): Promise<Response> {
  if (kind !== 'keyword-review') return response.clone();
  const headers = new Headers(response.headers);
  headers.set('x-submission-replayed', String(replayed));
  if (attemptId) headers.set('x-submission-attempt-id', attemptId);
  let text = await response.clone().text();
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      text = JSON.stringify({ ...body, replayed, ...(attemptId ? { submissionAttemptId: attemptId } : {}) });
    }
  } catch { /* Keep an older non-JSON receipt intact; its headers still identify the replay. */ }
  return new Response(text, { status: response.status, headers });
}

export function isExpiredReceipt(createdAt: number | undefined, now = Date.now()): boolean {
  return !createdAt || now - createdAt >= SUBMISSION_RECEIPT_TTL_MS;
}

function receiptsRoot(): string {
  const root = process.env.AZHUO_DATA_DIR || path.resolve('.local/submission-receipts');
  return path.join(root, 'submission-receipts');
}

function receiptsDir(): string {
  return path.join(receiptsRoot(), requireWorkspaceId());
}

/** Read an operation's receipt without dispatching or waiting for another submission. */
export async function readSubmissionReceipt(kind: 'image' | 'video' | 'depth-image' | 'depth-video', credentials: { baseUrl: string; apiKey: string }, operation: string): Promise<Response | null> {
  if (!operation.trim() || operation.length > 256) return null;
  const scope = digest(`${kind}\0${credentials.baseUrl}\0${credentials.apiKey}`);
  const key = digest(`${requireWorkspaceId()}\0${scope}\0${operation}`);
  let saved: Receipt;
  try {
    saved = JSON.parse(await fs.readFile(path.join(receiptsDir(), `${key}.json`), 'utf8')) as Receipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if ((saved.kind && saved.kind !== kind) || !saved.status || saved.body === undefined) return null;
  let body = saved.body;
  try {
    const data = JSON.parse(body);
    if (saved.status >= 400 && saved.status < 500 && data?.success === false && !data.submissionUnknown) {
      body = JSON.stringify({ ...data, submissionRejected: true });
    }
  } catch { /* An unreadable receipt remains unresolved; never dispatch another POST here. */ }
  return new Response(body, { status: saved.status, headers: { 'content-type': 'application/json' } });
}

async function receiptDirs(): Promise<string[]> {
  const current = getWorkspaceId();
  if (current) return [path.join(receiptsRoot(), current)];
  const root = receiptsRoot();
  const names = await fs.readdir(root).catch(() => [] as string[]);
  const dirs = [root];
  for (const name of names) dirs.push(path.join(root, name));
  return dirs;
}

export async function purgeExpiredSubmissionReceipts(now = Date.now()): Promise<number> {
  let purged = 0;
  for (const dir of await receiptDirs()) {
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(dir, name);
      try {
        const saved = JSON.parse(await fs.readFile(file, 'utf8')) as Receipt;
        if (saved.kind !== 'keyword-review' && isExpiredReceipt(saved.createdAt, now)) {
          await fs.unlink(file);
          purged += 1;
        }
      } catch {
        /* ignore unreadable receipts */
      }
    }
  }
  return purged;
}

/** Durable receipt is claimed before dispatch. Unknown outcomes are never blindly resubmitted. */
export async function guardSubmission(req: Request, kind: string, credentials: { baseUrl: string; apiKey: string }, submit: () => Promise<Response>): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.clone().json(); } catch { return Response.json({ success: false, error: '请求必须为 JSON 对象' }, { status: 400 }); }
  const validInput = kind === 'keyword-review'
    ? Array.isArray(body?.rows) && body.rows.length > 0
    : typeof body?.prompt === 'string' && body.prompt.trim().length > 0;
  if (!body || Array.isArray(body) || typeof body !== 'object' || !validInput) {
    const error = kind === 'keyword-review' ? '关键词审核行不能为空'
      : kind === 'video' ? '视频提示词不能为空，且必须为字符串' : '提示词必须为非空字符串';
    return Response.json({ success: false, error }, { status: 400 });
  }
  const operation = req.headers.get('x-idempotency-key')?.trim() || body.clientTaskId;
  if (operation !== undefined && (typeof operation !== 'string' || operation.length > 256)) {
    return Response.json({ success: false, error: '任务标识不合法' }, { status: 400 });
  }
  const attemptId = kind === 'keyword-review' ? req.headers.get('x-submission-attempt-id')?.trim() || undefined : undefined;
  if (attemptId && attemptId.length > 128) return Response.json({ success: false, error: '请求尝试标识不合法' }, { status: 400 });
  const input = { ...body };
  delete input.clientTaskId;
  delete input.customApiKey;
  const legacyFingerprint = digest(canonical(input));
  // Equivalent /v1 and trailing-slash spellings target the same model endpoint.
  if (kind === 'keyword-review') input.customBaseUrl = credentials.baseUrl;
  const scope = digest(`${kind}\0${credentials.baseUrl}\0${credentials.apiKey}`);
  const fingerprint = digest(canonical(input));
  // Without a client operation id each explicit request is a new generation.
  const key = digest(`${requireWorkspaceId()}\0${scope}\0${operation || randomUUID()}`);
  const existing = inFlight.get(key);
  if (existing) {
    const response = await existing;
    if (response.headers.get('x-request-fingerprint') !== fingerprint) return conflict();
    return withKeywordReceiptMeta(response, kind, response.headers.get('x-submission-attempt-id') || undefined, true);
  }
  const run = async (): Promise<Response> => {
    const dir = receiptsDir();
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${key}.json`);
    const receipt: Receipt = { fingerprint, kind, createdAt: Date.now(), ...(attemptId ? { attemptId } : {}) };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await fs.writeFile(file, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const saved: Receipt = JSON.parse(await fs.readFile(file, 'utf8'));
        if (kind !== 'keyword-review' && isExpiredReceipt(saved.createdAt)) {
          await fs.unlink(file).catch(() => {});
          continue;
        }
        // Exact older requests remain replayable after URL canonicalization.
        if (saved.fingerprint !== fingerprint && saved.fingerprint !== legacyFingerprint) return conflict();
        if (saved.status && saved.body !== undefined) return withKeywordReceiptMeta(new Response(saved.body, {
          status: saved.status, headers: { 'content-type': 'application/json', 'x-request-fingerprint': fingerprint },
        }), kind, saved.attemptId, true);
        return Response.json({ success: false, error: '该任务正在提交或提交结果待核对，请查询原任务，不要重复提交', submissionUnknown: true }, { status: 409 });
      }
    }
    const response = await submit();
    const text = await response.clone().text();
    const temp = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify({ ...receipt, status: response.status, body: text }), { mode: 0o600 });
    await fs.rename(temp, file);
    const headers = new Headers(response.headers);
    headers.set('x-request-fingerprint', fingerprint);
    return withKeywordReceiptMeta(new Response(text, { status: response.status, headers }), kind, attemptId, false);
  };
  const promise = run();
  inFlight.set(key, promise);
  try { return (await promise).clone(); } finally { inFlight.delete(key); }
}
function conflict() { return Response.json({ success: false, error: '同一任务标识不能用于不同的生成内容' }, { status: 409 }); }
