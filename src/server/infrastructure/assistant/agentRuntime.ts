/**
 * AgentRuntime — 以 item 数组为"真相之源"的 agent 状态机。
 *
 * 设计原则（Codex-style agent loop）：
 * 1. 单条 turn 内所有可观察对象（agent message / reasoning / tool call / approval）都是 `item`
 * 2. 每个 item 都有显式的 `status: running | done | error | cancelled`
 * 3. 客户端可以通过增量事件（`item/<kind>/started` / `delta` / `completed`）实时装配 UI，
 *    也可以在重连时直接拿到 `snapshot()` 的全量状态
 * 4. 旧式 `delta` / `tool_call` / `tool_result` 事件依然被发射，保证 web 端零侵入迁移
 *
 * Runtime 不负责 HTTP fetch 与 LLM 协议解析，仅持有"事件 + item 状态 + 可中断信号"三件套，
 * 由 `agentLoop` 在每个 LLM 轮次中调用其方法推进状态。
 */

import type {
  AssistantItem,
  ItemKind,
  TurnStatus,
  AssistantTurn,
  ApprovalDecision,
} from '@shared/domain/assistant/types';
import type { AssistantSSEEvent } from '@shared/domain/assistant/events';
import type { ToolDefinition } from './toolRegistry';
import { materializeRuntimeItems } from './runtimeItems';
import { legacyToolCallEvent, legacyToolResultEvent } from './runtimeEvents';

const idCounter = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export interface AgentRuntimeOptions {
  turnId: string;
  threadId: string;
  /** SSE 事件发射函数（API 层会包装为 `data: ...\n\n`） */
  send: (evt: AssistantSSEEvent) => void;
  /** 外部 AbortSignal：中断时所有 in-flight tool 都会被通知 */
  signal?: AbortSignal;
  /** 初始模型候选（仅用于快照，不影响事件发射） */
  initialModel?: string;
  /**
   * item 变更回调：startItem / appendItemText / completeItem / requestApproval 时触发。
   * API 层用此钩子把 item 增量投递到持久化队列，不阻塞 SSE 流。
   */
  onItemEvent?: (item: AssistantItem) => void;
}

export interface RuntimeApprovalRequest {
  approvalId: string;
  toolName: string;
  displayName: string;
  args: Record<string, unknown>;
}

export interface RuntimeToolCallMeta {
  callId: string;
  name: string;
  displayName: string;
  args: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  summary?: string;
  action?: Record<string, unknown>;
  visualImages?: Array<{ url: string; label?: string }>;
}

interface InternalItemState {
  id: string;
  kind: ItemKind;
  status: 'running' | 'done' | 'error' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  payload: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export class AgentRuntime {
  readonly turnId: string;
  readonly threadId: string;
  readonly createdAt: number;

  private readonly send: (evt: AssistantSSEEvent) => void;
  private readonly signal?: AbortSignal;
  /** 关闭时 flush 所有 item 增量。注入式，便于测试与多 runtime 隔离 */
  private readonly onItemEvent?: (item: AssistantItem) => void;

  private status: TurnStatus = 'running';
  private items: Map<string, InternalItemState> = new Map();
  /** 工具名 -> 等待中的审批 */
  private pendingApprovals: Map<string, RuntimeApprovalRequest> = new Map();
  /** toolName -> meta，approval resolve 时通过 toolName 回查 */
  private toolCalls: Map<string, RuntimeToolCallMeta> = new Map();
  /** 会话级自动批准的工具名集合 */
  private sessionApprovals: Set<string> = new Set();
  /** 已使用的总 token（聚合自 toolCall/completed + agent message / reasoning 终态） */
  private usage: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 };
  private modelUsed?: string;

  constructor(opts: AgentRuntimeOptions) {
    this.turnId = opts.turnId;
    this.threadId = opts.threadId;
    this.createdAt = Date.now();
    this.send = opts.send;
    this.signal = opts.signal;
    this.onItemEvent = opts.onItemEvent;
    this.send({
      type: 'turn/started',
      turnId: this.turnId,
      threadId: this.threadId,
      ...(opts.initialModel ? { model: opts.initialModel } : {}),
    });
  }

  // ───────────────────────── 状态查询 ─────────────────────────

  getStatus(): TurnStatus {
    return this.status;
  }

  getItem(id: string): InternalItemState | undefined {
    return this.items.get(id);
  }

  /** 列出全部 item（按 startedAt 排序），便于客户端一次性还原 UI */
  listItems(): AssistantItem[] {
    return Array.from(this.items.values())
      .sort((a, b) => a.startedAt - b.startedAt)
      .flatMap((it) => materializeRuntimeItems(it));
  }

  getPendingApprovals(): RuntimeApprovalRequest[] {
    return Array.from(this.pendingApprovals.values());
  }

  getToolCallMeta(toolName: string): RuntimeToolCallMeta[] {
    return Array.from(this.toolCalls.values()).filter((t) => t.name === toolName);
  }

  getSessionApprovals(): string[] {
    return Array.from(this.sessionApprovals);
  }

  setSessionApproval(toolName: string): void {
    this.sessionApprovals.add(toolName);
  }

  hasSessionApproval(toolName: string): boolean {
    return this.sessionApprovals.has(toolName);
  }

  // ───────────────────────── 推进 item ─────────────────────────

  startItem(kind: ItemKind, payload: Record<string, unknown> = {}, meta?: Record<string, unknown>): string {
    this.signal?.throwIfAborted();
    const id = idCounter(kind === 'agentMessage' ? 'msg' : kind === 'agentReasoning' ? 'reason' : kind);
    const state: InternalItemState = {
      id,
      kind,
      status: 'running',
      startedAt: Date.now(),
      payload,
      meta,
    };
    this.items.set(id, state);

    this.send({ type: 'item/started', turnId: this.turnId, itemId: id, kind, meta: kind === 'subAgent' ? { ...payload, ...meta } : meta });
    this.emitOnItem(id);

    // 同时发送特定类型专用事件（向后兼容旧的 kind/delta 命名空间）
    switch (kind) {
      case 'agentMessage':
        this.send({ type: 'item/agentMessage/started', turnId: this.turnId, itemId: id });
        break;
      case 'agentReasoning':
        this.send({ type: 'item/agentReasoning/started', turnId: this.turnId, itemId: id });
        break;
      case 'toolCall':
        this.send({
          type: 'item/toolCall/started',
          turnId: this.turnId,
          itemId: id,
          name: String(payload.name || ''),
          displayName: String(payload.displayName || payload.name || ''),
          args: String(payload.args ?? '{}'),
        });
        this.toolCalls.set(id, {
          callId: String(payload.callId || id),
          name: String(payload.name || ''),
          displayName: String(payload.displayName || payload.name || ''),
          args: String(payload.args ?? '{}'),
          status: 'running',
          startedAt: state.startedAt,
        });
        this.emitLegacyToolCall(id, 'running');
        break;
    }

    return id;
  }

  /** 累积文本增量（agentMessage / agentReasoning） */
  appendItemText(itemId: string, delta: string): void {
    const item = this.items.get(itemId);
    if (!item || item.status !== 'running') return;
    item.payload.content = String(item.payload.content || '') + delta;

    if (item.kind === 'agentMessage') {
      this.send({ type: 'item/agentMessage/delta', turnId: this.turnId, itemId, delta });
      // legacy 兼容
      this.send({ type: 'delta', content: delta });
    } else if (item.kind === 'agentReasoning') {
      this.send({ type: 'item/agentReasoning/delta', turnId: this.turnId, itemId, delta });
      this.send({ type: 'thinking', content: delta });
    }
    this.emitOnItem(itemId);
  }

  /** 累积 tool call JSON 参数（OpenAI 流式） */
  appendToolCallArgs(itemId: string, argsDelta: string): void {
    const item = this.items.get(itemId);
    if (!item || item.kind !== 'toolCall' || item.status !== 'running') return;
    item.payload.args = String(item.payload.args || '') + argsDelta;
    const meta = this.toolCalls.get(itemId);
    if (meta) meta.args = String(meta.args || '') + argsDelta;
    this.send({ type: 'item/toolCall/delta', turnId: this.turnId, itemId, argsDelta });
  }

  /** 完成一个 item —— 终态写入 payload + 广播 completed 事件 */
  completeItem(itemId: string, status: 'done' | 'error' | 'cancelled' = 'done'): void {
    const item = this.items.get(itemId);
    if (!item || item.status !== 'running') return;
    item.status = status;
    item.completedAt = Date.now();
    this.emitOnItem(itemId);

    this.send({
      type: 'item/completed',
      turnId: this.turnId,
      itemId,
      kind: item.kind,
      status,
      meta: item.kind === 'subAgent' ? { ...item.payload, ...item.meta } : item.meta,
    });

    if (item.kind === 'agentMessage') {
      this.send({
        type: 'item/agentMessage/completed',
        turnId: this.turnId,
        itemId,
        content: String(item.payload.content || ''),
      });
    } else if (item.kind === 'agentReasoning') {
      this.send({
        type: 'item/agentReasoning/completed',
        turnId: this.turnId,
        itemId,
        content: String(item.payload.content || ''),
      });
    } else if (item.kind === 'toolCall') {
      const meta = this.toolCalls.get(itemId);
      if (meta) {
        meta.status = status === 'done' ? 'done' : status === 'cancelled' ? 'error' : 'error';
        meta.completedAt = item.completedAt;
        meta.summary = String(item.payload.summary || '');
        if (item.payload.action) meta.action = item.payload.action as Record<string, unknown>;
        if (item.payload.visualImages) meta.visualImages = item.payload.visualImages as Array<{ url: string; label?: string }>;
      }

      const summary = String(item.payload.summary || '');
      const action = item.payload.action as Record<string, unknown> | undefined;
      const visualImages = item.payload.visualImages as Array<{ url: string; label?: string }> | undefined;
      this.send({
        type: 'item/toolCall/completed',
        turnId: this.turnId,
        itemId,
        name: String(item.payload.name || ''),
        displayName: String(item.payload.displayName || item.payload.name || ''),
        status: status === 'done' ? 'done' : 'error',
        summary,
        ...(action ? { action } : {}),
        ...(visualImages && visualImages.length > 0 ? { visualImages } : {}),
      });
      this.emitLegacyToolResult(itemId, status, summary, action, visualImages);

      if (visualImages && visualImages.length > 0) {
        this.send({
          type: 'tool_visual_inspection',
          turnId: this.turnId,
          toolName: String(item.payload.name || ''),
          displayName: String(item.payload.displayName || item.payload.name || ''),
          images: visualImages,
          message: `已查看 ${visualImages.length} 张图像`,
        });
      }
    }
  }

  // ───────────────────────── 审批 ─────────────────────────

  requestApproval(
    toolName: string,
    displayName: string,
    args: Record<string, unknown>,
  ): string {
    const approvalId = idCounter('appr');
    this.pendingApprovals.set(approvalId, { approvalId, toolName, displayName, args });
    this.status = 'awaiting_approval';
    const itemId = `appr_${approvalId}`;
    this.items.set(itemId, {
      id: itemId,
      kind: 'approvalRequest',
      status: 'running',
      startedAt: Date.now(),
      payload: { approvalId, toolName, displayName, args },
    });
    this.send({
      type: 'item/approval/request',
      turnId: this.turnId,
      approvalId,
      toolName,
      displayName,
      args,
    });
    this.emitOnItem(itemId);
    return approvalId;
  }

  resolveApproval(approvalId: string, decision: ApprovalDecision): void {
    const req = this.pendingApprovals.get(approvalId);
    if (!req) return;
    this.pendingApprovals.delete(approvalId);
    if (this.pendingApprovals.size === 0 && this.status === 'awaiting_approval') {
      this.status = 'running';
    }
    if (decision === 'acceptForSession') {
      this.sessionApprovals.add(req.toolName);
    }
    const itemId = `appr_${approvalId}`;
    const item = this.items.get(itemId);
    if (item) {
      item.status =
        decision === 'accept' || decision === 'acceptForSession'
          ? 'done'
          : decision === 'cancel'
            ? 'cancelled'
            : 'error';
      item.completedAt = Date.now();
      item.payload.decision = decision;
      this.emitOnItem(itemId);
    }
    this.send({
      type: 'item/approval/resolved',
      turnId: this.turnId,
      approvalId,
      decision,
    });
  }

  rejectAllApprovals(): void {
    for (const id of [...this.pendingApprovals.keys()]) this.resolveApproval(id, 'cancel');
  }

  // ───────────────────────── 终态 ─────────────────────────

  /** 收尾：发 turn/completed + done（legacy 兼容） */
  complete(emitEvents = true): void {
    if (this.status === 'completed' || this.status === 'failed' || this.status === 'interrupted') return;
    if (this.status === 'awaiting_approval') {
      this.rejectAllApprovals();
    }
    this.status = 'completed';
    if (emitEvents) {
      this.send({ type: 'turn/completed', turnId: this.turnId, usage: this.usage });
      this.send({ type: 'done' });
    }
  }

  interrupt(): void {
    if (this.status === 'completed' || this.status === 'failed' || this.status === 'interrupted') return;
    this.status = 'interrupted';
    this.rejectAllApprovals();
    for (const item of this.items.values()) if (item.status === 'running') this.completeItem(item.id, 'cancelled');
    this.send({ type: 'turn/interrupted', turnId: this.turnId });
  }

  fail(error: string, emitEvent = true): void {
    if (this.status === 'completed' || this.status === 'failed' || this.status === 'interrupted') return;
    this.status = 'failed';
    this.rejectAllApprovals();
    for (const item of this.items.values()) if (item.status === 'running') this.completeItem(item.id, 'error');
    if (emitEvent) this.send({ type: 'error', error });
  }

  setModelUsed(model: string): void {
    this.modelUsed = model;
  }

  setUsage(inputTokens: number, outputTokens: number): void {
    this.usage = { inputTokens, outputTokens };
  }

  /** 客户端可以一次性拿到全部状态（用于重连/恢复） */
  snapshot(): AssistantTurn {
    return {
      id: this.turnId,
      threadId: this.threadId,
      status: this.status,
      items: this.listItems(),
      usage: { ...this.usage },
      ...(this.modelUsed ? { modelUsed: this.modelUsed } : {}),
    };
  }

  /** 把内部 item 触发到 onItemEvent 钩子（消费方负责去重/序列化） */
  private emitOnItem(itemId: string): void {
    if (!this.onItemEvent) return;
    const state = this.items.get(itemId);
    if (!state) return;
    try {
      for (const item of materializeRuntimeItems(state)) this.onItemEvent(item);
    } catch {
      /* swallow consumer errors to keep stream flowing */
    }
  }

  // ───────────────────────── 工具辅助 ─────────────────────────

  /** 把 toolDefinition + args JSON 转成已开始的 toolCall item */
  startToolCall(toolDef: ToolDefinition, callId: string, args: string): string {
    const name = toolDef.name;
    const displayName = toolDef.openaiTool.function.name === name
      ? name
      : name; // toolRegistry.toolDisplayName 由调用方按需提供
    return this.startItem(
      'toolCall',
      { name, displayName, callId, args, scope: toolDef.scope, approval: toolDef.approval },
    );
  }

  /**
   * 把 tool call 的最终结果写入 item payload 并广播完成事件。
   * 必须在 startItem('toolCall', ...) 或 startToolCall(...) 之后调用。
   */
  completeToolCall(
    itemId: string,
    opts: {
      status: 'done' | 'error' | 'cancelled';
      summary: string;
      action?: Record<string, unknown>;
      visualImages?: Array<{ url: string; label?: string }>;
    },
  ): void {
    const item = this.items.get(itemId);
    if (!item || item.status !== 'running') return;
    item.payload.summary = opts.summary;
    if (opts.action) item.payload.action = opts.action;
    if (opts.visualImages) item.payload.visualImages = opts.visualImages;
    this.completeItem(itemId, opts.status);
  }

  /** 视觉呈递事件（tool result 携带的图像供前端高亮提示） */
  emitVisualInspection(
    toolName: string,
    displayName: string,
    images: Array<{ url: string; label?: string }>,
  ): void {
    this.send({
      type: 'tool_visual_inspection',
      turnId: this.turnId,
      toolName,
      displayName,
      images,
      message: `已查看 ${images.length} 张图像`,
    });
  }

  private emitLegacyToolCall(itemId: string, status: 'running' | 'done' | 'error'): void {
    const item = this.items.get(itemId);
    if (!item) return;
    this.send(legacyToolCallEvent(item.payload, status));
  }

  private emitLegacyToolResult(
    itemId: string,
    status: 'done' | 'error' | 'cancelled',
    summary: string,
    action?: Record<string, unknown>,
    visualImages?: Array<{ url: string; label?: string }>,
  ): void {
    const item = this.items.get(itemId);
    if (!item) return;
    this.send(legacyToolResultEvent(item.payload, status, summary, action, visualImages));
  }


}

/** 便利工厂 */
export function createAgentRuntime(opts: AgentRuntimeOptions): AgentRuntime {
  return new AgentRuntime(opts);
}
