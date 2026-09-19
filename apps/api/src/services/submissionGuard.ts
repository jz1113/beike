import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const inFlight = new Map<string, Promise<Response>>();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
interface Receipt { fingerprint: string; status?: number; body?: string; createdAt: number }

/** Durable receipt is claimed before dispatch. Unknown outcomes are never blindly resubmitted. */
export async function guardSubmission(req: Request, kind: string, credentials: { baseUrl: string; apiKey: string }, submit: () => Promise<Response>): Promise<Response> {
  let body: Record<string, unknown>;
  try { body = await req.clone().json(); } catch { return Response.json({ success: false, error: '请求必须为 JSON 对象' }, { status: 400 }); }
  if (!body || Array.isArray(body) || typeof body !== 'object' || typeof body.prompt !== 'string' || !body.prompt.trim()) {
    return Response.json({ success: false, error: kind === 'video' ? '视频提示词不能为空，且必须为字符串' : '提示词必须为非空字符串' }, { status: 400 });
  }
  const operation = req.headers.get('x-idempotency-key')?.trim() || body.clientTaskId;
  if (operation !== undefined && (typeof operation !== 'string' || operation.length > 256)) {
    return Response.json({ success: false, error: '任务标识不合法' }, { status: 400 });
  }
  const input = { ...body };
  delete input.clientTaskId;
  delete input.customApiKey;
  const scope = digest(`${kind}\0${credentials.baseUrl}\0${credentials.apiKey}`);
  const fingerprint = digest(canonical(input));
  // Without a client operation id each explicit request is a new generation.
  const key = digest(`${scope}\0${operation || randomUUID()}`);
  const existing = inFlight.get(key);
  if (existing) {
    const response = await existing;
    if (response.headers.get('x-request-fingerprint') !== fingerprint) return conflict();
    return response.clone();
  }
  const run = async (): Promise<Response> => {
    const root = process.env.AZHUO_DATA_DIR || path.resolve('.local/submission-receipts');
    const dir = path.join(root, 'submission-receipts');
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${key}.json`);
    const receipt: Receipt = { fingerprint, createdAt: Date.now() };
    try {
      await fs.writeFile(file, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const saved: Receipt = JSON.parse(await fs.readFile(file, 'utf8'));
      if (saved.fingerprint !== fingerprint) return conflict();
      if (saved.status && saved.body !== undefined) return new Response(saved.body, { status: saved.status, headers: { 'content-type': 'application/json', 'x-request-fingerprint': fingerprint } });
      return Response.json({ success: false, error: '该任务正在提交或提交结果待核对，请查询原任务，不要重复提交', submissionUnknown: true }, { status: 409 });
    }
    const response = await submit();
    const text = await response.clone().text();
    const temp = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify({ ...receipt, status: response.status, body: text }), { mode: 0o600 });
    await fs.rename(temp, file);
    const headers = new Headers(response.headers);
    headers.set('x-request-fingerprint', fingerprint);
    return new Response(text, { status: response.status, headers });
  };
  const promise = run();
  inFlight.set(key, promise);
  try { return (await promise).clone(); } finally { inFlight.delete(key); }
}
function conflict() { return Response.json({ success: false, error: '同一任务标识不能用于不同的生成内容' }, { status: 409 }); }
