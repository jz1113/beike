import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import type { AssistantRunMode, ReferenceScope } from '@shared/domain/assistant/taskPolicy';
import { useCallback, useRef } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { getGatewayClientOverrides } from '@client/shared/api/gatewayClient';
import { approveAssistantTool, executeClientToolAction } from '@client/features/assistant/utils/assistantClientActions';
import type {
  TurnStreamState,
  ApprovalDecision,
  ToolActivityEntry,
} from '@client/features/assistant/utils/assistantTurnTypes';
import type {
  AssistantItem,
  ApprovalRequestItem,
} from '@shared/domain/assistant/types';
import { initialState, applyItemEvent, deriveLegacyState, finishInterruptedItems } from './assistantTurnItems';
import { normalizeAssistantItems, normalizeAssistantTask } from '@shared/domain/assistant/normalizeAssistantItems';
import { readAssistantEvents } from '../utils/readAssistantEvents';
import { submitPreparedAssistantTurn } from '../utils/assistantTurnRecovery';
import { fetchAssistantTurnSnapshot } from '../api/runs';
export { deriveLegacyState } from './assistantTurnItems';

export interface RunTurnParams {
  sessionId: string;
  assistantMsgId: string;
  messages: Array<{ id?: string; timestamp?: number; error?: boolean; role: string; content: string; attachments?: unknown[] }>;
  model: string;
  reasoningEffort?: ReasoningEffort;
  runMode?: AssistantRunMode;
  referenceScope?: ReferenceScope;
  fallbackModels: string[];
  historyLimit: number;
  systemPrompt: string;
  skillId?: string;
  allowedTools?: string[];
  language: string;
  clientContext: Record<string, unknown>;
  sessionApprovals: string[];
  signal: AbortSignal;
  onUpdate: (patch: Partial<TurnStreamState>) => void;
  onTurnPrepared: (turnId: string) => void | Promise<void>;
  showToast: (msg: string) => void;
}

export function useAssistantTurn() {
  const turnIdRef = useRef<string | null>(null);
  /** 安全：记录**上一个**已完成的 turnId，用于断线重连时恢复快照（避免用新生成的 ID 查历史） */
  const lastTurnIdRef = useRef<string | null>(null);
  const stateRef = useRef<TurnStreamState>(initialState());
  const itemsRef = useRef<AssistantItem[]>([]);
  const turnIdForApprovalRef = useRef<string>('');

  const patch = useCallback((partial: Partial<TurnStreamState>, onUpdate: RunTurnParams['onUpdate']) => {
    stateRef.current = { ...stateRef.current, ...partial };
    onUpdate(partial);
  }, []);

  const handleApprovalDecision = useCallback(
    async (approvalId: string, decision: ApprovalDecision, onUpdate: RunTurnParams['onUpdate']) => {
      const turnId = turnIdRef.current;
      const approval = stateRef.current.pendingApprovals.find((item) => item.approvalId === approvalId);
      if (!turnId || !approval) throw new Error('审批请求已过期，请刷新当前任务');
      await approveAssistantTool(turnId, approvalId, decision);
      if (turnIdRef.current !== turnId || !stateRef.current.pendingApprovals.some((item) => item.approvalId === approvalId)) return;

      const nextItems = applyItemEvent(itemsRef.current, {
        type: 'item/approval/resolved',
        turnId,
        approvalId,
        decision,
      });
      itemsRef.current = nextItems;
      const legacy = deriveLegacyState(nextItems);
      patch(
        {
          ...legacy,
          sessionApprovals:
            decision === 'acceptForSession'
              ? [
                  ...stateRef.current.sessionApprovals, approval.toolName,
                ].filter((name, index, list) => list.indexOf(name) === index)
              : stateRef.current.sessionApprovals,
        },
        onUpdate,
      );
    },
    [patch],
  );

  /**
   * 恢复上轮对话进度（用于断线重连）。
   * 使用 lastTurnIdRef 而非当前 turnIdRef，确保查的是"上一轮"而非正在生成的"新 turn"。
   */
  const fetchTurnSnapshot = useCallback(
    async (turnId: string, showToast: (msg: string) => void, sessionId?: string) => {
      const targetTurnId = turnId || lastTurnIdRef.current;
      if (!targetTurnId) return null;
      try {
        const snapshot = await fetchAssistantTurnSnapshot(targetTurnId, sessionId);
        if (!snapshot) return null;
        showToast('已恢复上轮对话进度');
        return snapshot;
      } catch {
        return null;
      }
    },
    [],
  );

  const runTurn = useCallback(async (params: RunTurnParams) => {
    const {
      sessionId,
      messages,
      model,
      fallbackModels,
      historyLimit,
      systemPrompt,
      skillId,
      allowedTools,
      language,
      clientContext,
      sessionApprovals,
      signal,
      onUpdate,
      showToast,
    } = params;

    stateRef.current = { ...initialState(), sessionApprovals: [...sessionApprovals] };
    itemsRef.current = [];

    // Every request is a distinct turn. Reusing turnId overwrote persisted history and
    // made retries ambiguous; threadId is the stable assistant session identity.
    lastTurnIdRef.current = turnIdRef.current;
    const nextTurnId = `turn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    turnIdRef.current = nextTurnId;
    turnIdForApprovalRef.current = nextTurnId;
    patch({}, onUpdate);

    const { customBaseUrl: localUrl } = getGatewayClientOverrides();

    const res = await submitPreparedAssistantTurn(nextTurnId, params.onTurnPrepared, () => apiFetch('/api/assistant/turn/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        threadId: sessionId,
        turnId: nextTurnId,
        messages,
        model,
        reasoningEffort: params.reasoningEffort,
        fallbackModels,
        historyLimit,
        runMode: params.runMode,
        referenceScope: params.referenceScope,
        customBaseUrl: localUrl,
        systemPrompt,
        skillId,
        allowedTools,
        enableAgentTools: true,
        language,
        clientContext,
        sessionApprovals: stateRef.current.sessionApprovals,
      }),
      signal,
    }), signal);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI 助手服务响应异常');
      }
      patch({ content: data.reply || '' }, onUpdate);
      return stateRef.current;
    }

    if (!res.ok) throw new Error(`AI 助手请求失败（HTTP ${res.status}）`);
    if (!contentType.includes('text/event-stream')) throw new Error('AI 助手返回了无效的流式响应');
    if (!res.body) throw new Error('未获取到流式响应体');

    let receivedTerminal = false;
    const executedActions = new Set<string>();
    try {
      for await (const evt of readAssistantEvents(res.body, signal)) {
        if (evt.type === 'done' || evt.type === 'turn/completed') receivedTerminal = true;
        if (evt.type === 'turn/interrupted') throw new Error('对话已中断，已生成内容已保留，请重试。');

        if (evt.type === 'turn/started' && evt.turnId) {
          if (evt.threadId && evt.threadId !== sessionId) throw new Error('对话响应与当前会话不匹配');
          // Server normally echoes nextTurnId; still accept its canonical ID.
          turnIdRef.current = evt.turnId;
          turnIdForApprovalRef.current = evt.turnId;
        }

        // turn/snapshot: 直接替换 item[]，重建 UI
        if (evt.type === 'turn/snapshot' && evt.snapshot) {
          if ((evt.snapshot.threadId && evt.snapshot.threadId !== sessionId) || (evt.snapshot.id && evt.snapshot.id !== turnIdRef.current)) throw new Error('对话快照与当前任务不匹配');
          const snapItems = normalizeAssistantItems(evt.snapshot.items);
          itemsRef.current = snapItems;
          // 同步 pendingApprovals 的 turnId
          const legacy = deriveLegacyState(snapItems);
          patch(
            {
              ...legacy,
              ...(normalizeAssistantTask(evt.snapshot.task) ? { task: normalizeAssistantTask(evt.snapshot.task) } : {}),
              modelUsed: evt.snapshot.modelUsed || stateRef.current.modelUsed,
              pendingApprovals: legacy.pendingApprovals.map((a) => ({
                ...a,
                turnId: turnIdForApprovalRef.current,
              })),
            },
            onUpdate,
          );
          continue;
        }

        if (evt.type === 'meta') {
          patch(
            {
              modelUsed: evt.modelUsed || model,
              productWidget: evt.productWidget,
              streamingStatus: undefined,
            },
            onUpdate,
          );
          if (evt.modelSwitched && evt.modelUsed && evt.modelUsed !== model) {
            showToast(`主模型不可用，已改用「${evt.modelUsed}」`);
          }
        }

        if (evt.type === 'task') {
          const task = normalizeAssistantTask(evt.task);
          if (task) patch({ task }, onUpdate);
        }
        if ((evt.type === 'turn/completed' || evt.type === 'done') && stateRef.current.task?.status === 'running') {
          patch({ task: { ...stateRef.current.task, status: 'completed', stage: '本轮已完成' } }, onUpdate);
        }
        if (evt.type === 'status' && evt.message) {
          patch({ streamingStatus: String(evt.message) }, onUpdate);
        }

        // ── Codex-style item/* events (primary path) ──
        if (evt.type && typeof evt.type === 'string' && evt.type.startsWith('item/')) {
          const nextItems = applyItemEvent(itemsRef.current, evt);
          itemsRef.current = nextItems;
          const legacy = deriveLegacyState(nextItems);
          // 注入 turnId 到 pendingApprovals
          const pendingApprovals = legacy.pendingApprovals.map((a) => ({
            ...a,
            turnId: turnIdForApprovalRef.current,
          }));
          // sessionApprovals 增量更新
          let nextSessionApprovals = stateRef.current.sessionApprovals;
          if (evt.type === 'item/approval/resolved' && evt.decision === 'acceptForSession') {
            const ap = nextItems.find(
              (x) => x.kind === 'approvalRequest' && (x as ApprovalRequestItem).approvalId === evt.approvalId,
            ) as ApprovalRequestItem | undefined;
            if (ap && !nextSessionApprovals.includes(ap.toolName)) {
              nextSessionApprovals = [...nextSessionApprovals, ap.toolName];
            }
          }
          patch(
            {
              ...legacy,
              pendingApprovals,
              sessionApprovals: nextSessionApprovals,
              ...(evt.type === 'item/agentMessage/delta' ? { streamingStatus: undefined } : {}),
            },
            onUpdate,
          );

          if (evt.type === 'item/toolCall/completed' && evt.action && evt.status === 'done' && !executedActions.has(evt.itemId)) {
            executedActions.add(evt.itemId);
            executeClientToolAction(evt.action, showToast, sessionId);
          }
          continue;
        }

        // ── Legacy events (backward compat) ──
        if (evt.type === 'delta' && evt.content && !itemsRef.current.some((item) => item.kind === 'agentMessage')) {
          patch(
            {
              content: stateRef.current.content + evt.content,
              streamingStatus: undefined,
            },
            onUpdate,
          );
        }

        if (evt.type === 'thinking' && evt.content && !itemsRef.current.some((item) => item.kind === 'agentReasoning')) {
          patch({ thinking: stateRef.current.thinking + evt.content }, onUpdate);
        }

        if ((evt.type === 'tool_call' || evt.type === 'tool_result') && !itemsRef.current.some((item) => item.kind === 'toolCall')) {
          const prev = [...stateRef.current.toolActivity];
          const idx = prev.findIndex((t) => t.name === evt.name && t.status === 'running');
          const visualImages = (evt as any).visualImages;
          const entry: ToolActivityEntry = {
            name: evt.name,
            displayName: evt.displayName || evt.name,
            status: (evt.status === 'error' ? 'error' : evt.status === 'done' ? 'done' : 'running') as ToolActivityEntry['status'],
            detail: evt.detail,
            action: evt.action,
            ...(visualImages ? { visualImages } : {}),
          };

          if (evt.type === 'tool_result' && idx >= 0) {
            prev[idx] = {
              ...entry,
              visualImages: visualImages || prev[idx].visualImages,
            };
            if (evt.action && evt.status !== 'error') {
              executeClientToolAction(evt.action, showToast, sessionId);
            }
          } else if (evt.type === 'tool_call') {
            prev.push(entry);
          } else {
            prev.push(entry);
          }
          patch({ toolActivity: prev }, onUpdate);
        }

        if ((evt as any).type === 'tool_visual_inspection') {
          const inspEvt = evt as any;
          const prev = [...stateRef.current.toolActivity];
          const idx = prev.findIndex((t) => t.name === inspEvt.toolName);
          if (idx >= 0) {
            prev[idx] = {
              ...prev[idx],
              visualImages: inspEvt.images || prev[idx].visualImages,
              detail: inspEvt.message || prev[idx].detail,
            };
            patch({ toolActivity: prev }, onUpdate);
          }
        }

        if (evt.type === 'error') {
          throw new Error(evt.error || '流式传输异常');
        }
        if (receivedTerminal) break;
      }
    } catch (streamErr: unknown) {
      // 🐛 不要吞：把 SSE 流错误暴露给上层，触发 toast + 重连
      itemsRef.current = finishInterruptedItems(itemsRef.current, signal.aborted);
      patch({ ...(itemsRef.current.length ? deriveLegacyState(itemsRef.current) : { pendingApprovals: [] }), streamingStatus: undefined,
        ...(stateRef.current.task ? { task: { ...stateRef.current.task, status: signal.aborted ? 'cancelled' : 'failed', stage: signal.aborted ? '用户已停止' : '本轮未完成' } } : {}),
      }, onUpdate);
      console.error('[SSE stream error]', streamErr);
      throw streamErr instanceof Error
        ? streamErr
        : new Error(typeof streamErr === 'string' ? streamErr : 'SSE 流异常断开');
    }

    if (!receivedTerminal) {
      itemsRef.current = finishInterruptedItems(itemsRef.current, false);
      patch({ ...(itemsRef.current.length ? deriveLegacyState(itemsRef.current) : { pendingApprovals: [] }), streamingStatus: undefined,
        ...(stateRef.current.task ? { task: { ...stateRef.current.task, status: 'failed', stage: '连接中断，执行结果待核实' } } : {}),
      }, onUpdate);
      throw new Error('对话连接意外断开（服务重启或网络中断），已生成内容已保留，请重试。');
    }
    return stateRef.current;
  }, [patch]);

  return {
    runTurn,
    handleApprovalDecision,
    turnIdRef,
    fetchTurnSnapshot,
    /** 当前 turn 的 items[]（Codex-style 单一数据源） */
    getItems: () => itemsRef.current,
  };
}
