import { useAppStore, type GenerationTask } from '@client/store';
import { apiFetch } from '@client/shared/api/apiClient';
import { getGatewayClientOverrides, getModelCredentials } from '@client/shared/api/gatewayClient';
import { readSseEvents } from '@client/shared/api/sseStream';
import { applyItemEvent, deriveTurnView } from '@client/shared/agent/turnItems';
import type { AssistantItem } from '@shared/domain/assistant/types';
import { parseAgentAttachments, visibleAgentPrompt, type ParsedAttachment } from '../model/agentArtifact';
import type { TaskUpdater } from './generationTaskTypes';
import type { AgentTurnTaskData } from '@client/store/appStoreTypes';
import { resolveAgentSystemPrompt } from '@client/shared/prompt-bar/agentDefinitions';
import { composeSkillRuntime } from '@shared/domain/assistant/skills';
import { loadPromptPreferences } from '@client/shared/prompt-bar/promptBarPreferencesTypes';

const HISTORY_TURNS = 10;
const liveStops = new Map<string, AbortController>();

function formatAttachmentsForBackend(attachments: ParsedAttachment[]) {
  return attachments.map((att) => ({
    name: att.name,
    type: att.kind === 'image' ? 'image' : att.kind === 'video' ? 'video' : 'document',
    url: att.url.startsWith('agent-file:') ? '' : att.url,
    extractedText: att.textSnippet || undefined,
  }));
}

function priorMessages(task: GenerationTask) {
  const prior = useAppStore.getState().generationTasks
    .filter((item) =>
      item.id !== task.id
      && (item.mediaType === 'agent' || item.id.startsWith('agent-task-'))
      && (!task.sessionId || item.sessionId === task.sessionId)
      && (item.createdAt || 0) <= (task.createdAt || 0),
    )
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const item of prior) {
    const user = visibleAgentPrompt(item.prompt || '');
    const reply = item.agentTurn?.reply?.trim() || '';
    if (user) messages.push({ role: 'user', content: user });
    if (reply) messages.push({ role: 'assistant', content: reply });
  }
  return messages.slice(-HISTORY_TURNS * 2);
}

export function interruptAgentTurn(turnId?: string) {
  if (!turnId) return;
  void apiFetch('/api/assistant/turn/interrupt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnId }),
  }).catch(() => undefined);
}

export function stopAgentTask(taskId: string) {
  const task = useAppStore.getState().generationTasks.find((item) => item.id === taskId);
  liveStops.get(taskId)?.abort();
  interruptAgentTurn(task?.agentTurn?.turnId || task?.taskId);
  useAppStore.getState().updateGenerationTask(taskId, {
    status: 'FAILURE',
    submissionRecoveryRequired: false,
    failReason: '已停止生成',
  });
}

export async function submitAgentTask(
  task: GenerationTask,
  updateGenerationTask: TaskUpdater,
  signal?: AbortSignal,
) {
  const store = useAppStore.getState();
  const rawModel = task.model || store.assistantModel || 'gemini-3.7-flash';
  const model = rawModel === 'deepseek-flash' ? 'deepseek-v4-flash' : rawModel;
  const turnId = task.agentTurn?.turnId || `turn-agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const threadId = task.sessionId || task.agentTurn?.threadId || `session-${task.batchId || 'agent'}`;
  const local = new AbortController();
  liveStops.set(task.id, local);
  const stop = () => local.abort();
  if (signal?.aborted) local.abort();
  else signal?.addEventListener('abort', stop, { once: true });

  const agentTurn: AgentTurnTaskData = {
    turnId,
    threadId,
    modelUsed: model,
    thinking: '',
    reply: '',
    steps: [],
    toolActivity: [],
    suggestions: [],
    items: [],
  };

  updateGenerationTask(task.id, {
    status: 'IN_PROGRESS',
    progress: '15%',
    taskId: turnId,
    failReason: undefined,
    agentTurn,
  });

  const currentPrompt = visibleAgentPrompt(task.prompt || '') || task.prompt || '';
  const attachments = parseAgentAttachments(task);
  const skillRuntime = composeSkillRuntime(store.getActiveAssistantSkill());
  const prefs = loadPromptPreferences();
  const overrides = getGatewayClientOverrides();
  const modalityCreds = getModelCredentials(model);
  const customBaseUrl = modalityCreds.baseUrl || overrides.customBaseUrl;
  const customApiKey = modalityCreds.apiKey || overrides.customApiKey;
  const requestBody: Record<string, unknown> = {
    turnId,
    threadId,
    model,
    messages: [
      ...priorMessages(task),
      {
        role: 'user',
        content: currentPrompt || '你好',
        attachments: formatAttachmentsForBackend(attachments),
      },
    ],
    systemPrompt: [resolveAgentSystemPrompt(), skillRuntime?.systemPrompt || ''].filter(Boolean).join('\n\n'),
    generationMode: 'auto',
    reasoningEffort: prefs.reasoning?.reasoningEffort || 'medium',
    ...(customBaseUrl ? { customBaseUrl } : {}),
    ...(customApiKey ? { customApiKey } : {}),
  };
  if (skillRuntime) {
    requestBody.skillId = skillRuntime.skillId;
    if (skillRuntime.allowedTools?.length) requestBody.allowedTools = skillRuntime.allowedTools;
  }

  let response: Response;
  try {
    response = await apiFetch('/api/assistant/turn/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: local.signal,
    });
  } catch (err: unknown) {
    liveStops.delete(task.id);
    if (local.signal.aborted) {
      interruptAgentTurn(turnId);
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    updateGenerationTask(task.id, {
      status: 'FAILURE',
      submissionRecoveryRequired: false,
      failReason: `连接模型服务失败: ${msg}。请检查网络或在「设置 → 服务接口配置」中核对服务地址。`,
    });
    return;
  }

  if (!response.ok || !response.body) {
    liveStops.delete(task.id);
    let errMsg = `请求失败 HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errMsg = errJson.error;
    } catch { /* keep the status text */ }
    updateGenerationTask(task.id, {
      status: 'FAILURE',
      submissionRecoveryRequired: false,
      failReason: errMsg,
    });
    return;
  }

  let items: AssistantItem[] = [];
  let lastUpdateTime = 0;
  let failed = false;

  const flushUpdate = (force = false) => {
    const now = Date.now();
    if (!force && now - lastUpdateTime < 50) return;
    lastUpdateTime = now;
    const view = deriveTurnView(items);
    agentTurn.items = items;
    agentTurn.reply = view.content;
    agentTurn.thinking = view.thinking;
    agentTurn.toolActivity = view.toolActivity;
    updateGenerationTask(task.id, {
      agentTurn: { ...agentTurn, items: [...items] },
      progress: view.content ? '70%' : view.toolActivity.length ? '50%' : '35%',
    });
  };

  try {
    for await (const event of readSseEvents(response.body, local.signal)) {
      if (local.signal.aborted) break;
      if (typeof event.type === 'string' && event.type.startsWith('item/')) {
        items = applyItemEvent(items, event);
        flushUpdate(event.type.endsWith('/completed') || event.type.endsWith('/started'));
      }
      switch (event.type) {
        case 'turn/started':
          agentTurn.turnId = event.turnId || turnId;
          if (event.model) agentTurn.modelUsed = event.model;
          break;
        case 'status':
          if (event.message) {
            agentTurn.statusText = event.message;
            flushUpdate();
          }
          break;
        case 'meta':
          if (event.modelUsed) agentTurn.modelUsed = event.modelUsed;
          break;
        case 'error':
          failed = true;
          updateGenerationTask(task.id, {
            status: 'FAILURE',
            submissionRecoveryRequired: false,
            failReason: event.error || '模型执行中遇到异常，请检查配置后重试。',
            agentTurn: { ...agentTurn, items: [...items], reply: deriveTurnView(items).content, thinking: deriveTurnView(items).thinking },
          });
          return;
        default:
          break;
      }
    }

    if (local.signal.aborted) {
      interruptAgentTurn(agentTurn.turnId || turnId);
      return;
    }
    if (failed) return;

    const view = deriveTurnView(items);
    if (!view.content.trim()) {
      updateGenerationTask(task.id, {
        status: 'FAILURE',
        submissionRecoveryRequired: false,
        failReason: '模型没有返回内容，请重试。',
        agentTurn: { ...agentTurn, items: [...items], reply: '', thinking: view.thinking, toolActivity: view.toolActivity },
      });
      return;
    }
    agentTurn.reply = view.content;
    agentTurn.thinking = view.thinking;
    agentTurn.toolActivity = view.toolActivity;
    agentTurn.items = items;
    agentTurn.statusText = undefined;
    updateGenerationTask(task.id, {
      status: 'SUCCESS',
      progress: '100%',
      submissionRecoveryRequired: false,
      agentTurn: { ...agentTurn, items: [...items] },
    });
  } catch (streamErr: unknown) {
    if (local.signal.aborted) {
      interruptAgentTurn(agentTurn.turnId || turnId);
      return;
    }
    const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
    updateGenerationTask(task.id, {
      status: 'FAILURE',
      submissionRecoveryRequired: false,
      failReason: `读取模型回复中断: ${msg}`,
      agentTurn: { ...agentTurn, items: [...items] },
    });
  } finally {
    liveStops.delete(task.id);
  }
}
