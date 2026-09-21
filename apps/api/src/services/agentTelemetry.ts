/**
 * Agent Telemetry — 本地可观测性日志
 *
 * 每个 turn 的全生命周期事件落到 `app_data/agent-telemetry/turns-YYYYMMDD.jsonl`，
 * 单文件 > 10MB 自动归档。落盘失败不影响主流程。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type AgentTelemetryPhase =
  | 'turn/started'
  | 'turn/completed'
  | 'turn/interrupted'
  | 'turn/failed'
  | 'item/started'
  | 'item/completed'
  | 'approval/request'
  | 'approval/resolved'
  | 'streaming/connected'
  | 'streaming/disconnected'
  | 'streaming/recovered';

export interface AgentTelemetryEvent {
  ts: number;
  phase: AgentTelemetryPhase;
  turnId?: string;
  threadId?: string;
  model?: string;
  itemId?: string;
  itemKind?: string;
  toolName?: string;
  decision?: string;
  durationMs?: number;
  tokensIn?: number;
  tokensOut?: number;
  /** 当 turn 失败时附带原因 */
  reason?: string;
  /** 自定义标签，便于检索 */
  tags?: Record<string, string | number | boolean>;
}

export interface TelemetryEvent {
  ts: number;
  kind: string;
  requestId?: string;
  taskId?: string;
  provider?: string;
  durationMs?: number;
  result?: string;
  operation?: string;
  success?: boolean;
  reason?: string;
}

const SENSITIVE_KEY = /secret|password|prompt|cookie|credential|authorization|(api)?[_-]?key$/i;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ARCHIVE_PREFIX = 'turns-';

/**
 * 解析 app_data 根目录。Tauri 桌面运行时使用 platform-specific 用户目录；
 * 降级模式落到系统临时目录，避免污染工程工作区。
 */
export function resolveTelemetryDir(): string {
  const candidates = [
    // 1. Tauri 用户数据目录
    process.env.AZHUO_USER_DATA_DIR,
    // 2. 桌面 app 标识
    path.join(
      process.env.HOME || process.env.USERPROFILE || '/tmp',
      'Library/Application Support/com.azhuo.workbench',
    ),
    // 3. 开发降级模式统一落到系统临时目录
    path.join(os.tmpdir(), 'beike-workbench'),
  ];
  const base = candidates.find((p): p is string => Boolean(p && p.length > 0)) || candidates[2]!;
  return path.join(base, 'agent-telemetry');
}

let writeChain: Promise<void> = Promise.resolve();
let currentFile = '';
let currentBytes = 0;

function dateStamp(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    /* ignore */
  }
}

function fileFor(dir: string, day = dateStamp()): string {
  return path.join(dir, `${ARCHIVE_PREFIX}${day}.jsonl`);
}

/**
 * 单事件写入；写入失败静默吞掉以避免污染主流程。
 */
async function writeEvent(dir: string, evt: object): Promise<void> {
  try {
    await ensureDir(dir);
    if (!currentFile || currentFile !== fileFor(dir)) {
      currentFile = fileFor(dir);
      try {
        const stat = await fs.stat(currentFile);
        currentBytes = stat.size;
      } catch {
        currentBytes = 0;
      }
    }
    const line = `${JSON.stringify(evt)}\n`;
    currentBytes += Buffer.byteLength(line);
    if (currentBytes > MAX_FILE_BYTES) {
      // 归档
      const archived = currentFile.replace('.jsonl', `-${Date.now()}.jsonl`);
      try {
        await fs.rename(currentFile, archived);
      } catch {
        /* 文件可能不存在 */
      }
      currentBytes = Buffer.byteLength(line);
      currentFile = fileFor(dir);
    }
    await fs.appendFile(currentFile, line, 'utf8');
  } catch {
    /* 静默吞掉 */
  }
}

/**
 * 记录一条事件（异步非阻塞）。
 */
export function recordAgentEvent(evt: Omit<AgentTelemetryEvent, 'ts'>): void {
  const full: AgentTelemetryEvent = { ts: Date.now(), ...sanitizeTelemetry(evt) };
  enqueueWrite(full);
}

function canWriteLocalTelemetry(): boolean {
  return process.env.DESKTOP_SHELL === '1' || process.env.NODE_ENV !== 'production';
}

function sanitizeTelemetry<T extends Record<string, unknown>>(evt: T): T {
  const next = { ...evt };
  for (const key of Object.keys(next)) {
    if (SENSITIVE_KEY.test(key) || key.toLowerCase() === 'token') {
      delete next[key];
      continue;
    }
    const value = next[key];
    if (typeof value === 'string' && /^(sk-|Bearer\s+)/i.test(value)) delete next[key];
  }
  return next;
}

function enqueueWrite(evt: object): void {
  const dir = resolveTelemetryDir();
  writeChain = writeChain.then(() => writeEvent(dir, evt)).catch(() => undefined);
}

/** 通用本地遥测。只写 JSONL，生产环境不向未知 HTTP 地址发送。 */
export function recordTelemetry(evt: Omit<TelemetryEvent, 'ts'>): void {
  if (!canWriteLocalTelemetry()) return;
  enqueueWrite({ ts: Date.now(), ...sanitizeTelemetry(evt) });
}

export function recordAuditEvent(evt: {
  operation: string;
  requestId?: string;
  success: boolean;
  reason?: string;
}): void {
  recordTelemetry({
    kind: 'audit',
    operation: evt.operation,
    requestId: evt.requestId,
    success: evt.success,
    result: evt.success ? 'ok' : 'error',
    reason: evt.reason,
  });
}

export async function recordPollTelemetry(
  kind: 'image-poll' | 'video-poll',
  req: Request,
  run: () => Promise<Response>,
  provider?: string,
): Promise<Response> {
  const started = Date.now();
  const requestId = req.headers.get('x-request-id')?.trim() || undefined;
  const taskId = new URL(req.url).searchParams.get('taskId') || undefined;
  try {
    const response = await run();
    let result = String(response.status);
    try {
      const payload = await response.clone().json() as { status?: string; success?: boolean };
      if (typeof payload?.status === 'string') result = payload.status;
      else if (payload?.success === false) result = 'failed';
    } catch {
      /* ignore */
    }
    recordTelemetry({
      kind,
      requestId,
      taskId,
      provider,
      durationMs: Date.now() - started,
      result,
    });
    return response;
  } catch (error) {
    recordTelemetry({
      kind,
      requestId,
      taskId,
      provider,
      durationMs: Date.now() - started,
      result: 'failed',
    });
    throw error;
  }
}

/** 等待所有缓冲写入完成（用于测试与 graceful shutdown）。 */
export async function flushAgentTelemetry(): Promise<void> {
  await writeChain;
}

/**
 * 跟踪 turn 的高阶计时：开始/结束 token / 状态。
 * 配合 stream 接口使用。
 */
export class TurnTimer {
  private startTs = Date.now();
  private itemCount = 0;
  private toolCount = 0;

  constructor(
    private readonly turnId: string,
    private readonly threadId: string,
    private readonly model: string,
  ) {
    recordAgentEvent({
      phase: 'turn/started',
      turnId: this.turnId,
      threadId: this.threadId,
      model: this.model,
    });
  }

  itemStarted(kind: string): void {
    this.itemCount += 1;
    if (kind === 'toolCall') this.toolCount += 1;
    recordAgentEvent({
      phase: 'item/started',
      turnId: this.turnId,
      threadId: this.threadId,
      model: this.model,
      itemKind: kind,
    });
  }

  itemCompleted(kind: string, itemId?: string, status: 'done' | 'error' | 'cancelled' = 'done'): void {
    recordAgentEvent({
      phase: 'item/completed',
      turnId: this.turnId,
      threadId: this.threadId,
      model: this.model,
      itemId,
      itemKind: kind,
      tags: { status },
    });
  }

  approvalRequested(toolName: string, approvalId: string): void {
    recordAgentEvent({
      phase: 'approval/request',
      turnId: this.turnId,
      threadId: this.threadId,
      model: this.model,
      toolName,
      tags: { approvalId },
    });
  }

  approvalResolved(toolName: string, approvalId: string, decision: string): void {
    recordAgentEvent({
      phase: 'approval/resolved',
      turnId: this.turnId,
      threadId: this.threadId,
      model: this.model,
      toolName,
      decision,
      tags: { approvalId },
    });
  }

  streamingConnected(): void {
    recordAgentEvent({
      phase: 'streaming/connected',
      turnId: this.turnId,
      threadId: this.threadId,
      model: this.model,
    });
  }

  streamingDisconnected(reason?: string): void {
    recordAgentEvent({
      phase: 'streaming/disconnected',
      turnId: this.turnId,
      threadId: this.threadId,
      model: this.model,
      reason,
    });
  }

  streamingRecovered(): void {
    recordAgentEvent({
      phase: 'streaming/recovered',
      turnId: this.turnId,
      threadId: this.threadId,
      model: this.model,
    });
  }

  complete(opts: {
    status: 'completed' | 'interrupted' | 'failed';
    usage?: { inputTokens: number; outputTokens: number };
    reason?: string;
  }): void {
    const phase: AgentTelemetryPhase =
      opts.status === 'completed'
        ? 'turn/completed'
        : opts.status === 'interrupted'
          ? 'turn/interrupted'
          : 'turn/failed';
    recordAgentEvent({
      phase,
      turnId: this.turnId,
      threadId: this.threadId,
      model: this.model,
      durationMs: Date.now() - this.startTs,
      tokensIn: opts.usage?.inputTokens,
      tokensOut: opts.usage?.outputTokens,
      reason: opts.reason,
      tags: { itemCount: this.itemCount, toolCount: this.toolCount },
    });
  }
}
