import { selectedTextModel, selectedTextProtocol } from '@shared/domain/models/textModelRoute';
import { useAppStore, type GenerationTask } from '@client/store';
import { apiFetch } from '@client/shared/api/apiClient';
import { getMultimodalClientOverrides } from '@client/shared/api/gatewayClient';
import { readSseEvents } from '@client/shared/api/sseStream';
import { applyItemEvent, deriveTurnView, finishInterruptedItems } from '@client/shared/agent/turnItems';
import type { AssistantItem } from '@shared/domain/assistant/types';
import { visibleAgentPrompt } from '@client/shared/media/agentArtifact';
import type { TaskUpdater } from './generationTaskTypes';
import type { AgentTurnTaskData } from '@client/store/appStoreTypes';
import { resolveAgentSystemPrompt } from '@client/shared/prompt-bar/agentDefinitions';
import { composeSkillCatalog, composeSkillRuntime } from '@shared/domain/assistant/skills';
import { loadPromptPreferences } from '@client/shared/prompt-bar/promptBarPreferencesTypes';
import { generationBatchContext, generationPromptSources } from '@client/shared/agent/generationBatchSources';
import { persistAssistantMedia } from '@client/shared/api/persistAssistantMedia';
import { shouldAnalyzeVideoDirectly } from '@shared/domain/assistant/mediaAnalysis';
import { agentMessageAttachments, priorAgentMessages } from '../model/agentConversation';
import { executeGenerationBatchAction } from '@client/shared/agent/dispatchGenerationBatch';
import { readAgentTurnSnapshot, recoverAgentTurn, restoreAgentTurnItems } from './recoverAgentTurn';

const liveStops = new Map<string, AbortController>();

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
  const rawModel = task.modelRouteKey || task.model || store.assistantModel || 'gemini-3.7-flash';
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
  let response: Response;
  try {
    const attachments = await persistAssistantMedia(agentMessageAttachments(task), local.signal);
    if (attachments.length) updateGenerationTask(task.id, { referenceImages: attachments.map((item, index) => item.url || task.referenceImages?.[index] || '') });
    const skillRuntime = composeSkillRuntime(store.getActiveAssistantSkill());
    const prefs = loadPromptPreferences();
    const { modelId: upstream, textProtocol } = selectedTextModel(model);
    const routeOptions = getMultimodalClientOverrides(model);
    const messages = [
      ...priorAgentMessages([...new Map([...store.sessions.flatMap((session) => session.tasks), ...store.generationTasks].map((item) => [item.id, item])).values()], task),
      { role: 'user', content: currentPrompt || (attachments.length ? '请分析上传的素材。' : '你好'), attachments },
    ];
    const directVideo = shouldAnalyzeVideoDirectly(messages, skillRuntime?.skillId);
    const requestBody: Record<string, unknown> = {
      turnId,
      threadId,
      model: model.startsWith('deepseek-official:') ? model : upstream,
      textProtocol: textProtocol && textProtocol !== 'auto' ? textProtocol : selectedTextProtocol(model),
      messages,
      enableAgentTools: !directVideo,
      systemPrompt: [resolveAgentSystemPrompt(), skillRuntime?.systemPrompt || ''].filter(Boolean).join('\n\n'),
      generationMode: 'auto',
      clientContext: { currentView: 'generate', generationBatches: generationBatchContext(generationPromptSources(store, 'agent', threadId, task.id)) },
      reasoningEffort: prefs.reasoning?.reasoningEffort || 'medium',
      ...routeOptions,
    };
    if (skillRuntime) {
      requestBody.skillId = skillRuntime.skillId;
      if (skillRuntime.allowedTools?.length) requestBody.allowedTools = skillRuntime.allowedTools;
      if (skillRuntime.resources.length) requestBody.skillResources = skillRuntime.resources;
    }
    const skillCatalog = composeSkillCatalog(store.getAllAssistantSkills());
    if (!directVideo && skillCatalog.length) requestBody.skillCatalog = skillCatalog;

    response = await apiFetch('/api/assistant/turn/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: local.signal,
    });
  } catch (err: unknown) {
    liveStops.delete(task.id);
    signal?.removeEventListener('abort', stop);
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
    signal?.removeEventListener('abort', stop);
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
  const executedBatchActions = new Set<string>();
  let lastUpdateTime = 0;
  let receivedTerminal = false;

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

  const completeTask = () => {
    const view = deriveTurnView(items);
    agentTurn.statusText = undefined;
    updateGenerationTask(task.id, {
      status: view.content.trim() ? 'SUCCESS' : 'FAILURE',
      progress: view.content.trim() ? '100%' : undefined,
      submissionRecoveryRequired: false,
      failReason: view.content.trim() ? undefined : '模型没有返回内容，请重试。',
      agentTurn: { ...agentTurn, items: [...items], reply: view.content, thinking: view.thinking, toolActivity: view.toolActivity },
    });
  };

  try {
    for await (const event of readSseEvents(response.body, local.signal)) {
      if (local.signal.aborted) break;
      if (event.type === 'item/toolCall/completed' && event.action?.action === 'generate_batch' && event.status === 'done' && !executedBatchActions.has(event.itemId)) {
        executedBatchActions.add(event.itemId);
        try {
          const receipts = executeGenerationBatchAction(event.action, 'agent', threadId, currentPrompt);
          agentTurn.generationNotice = `已保留 ${receipts.reduce((sum, receipt) => sum + receipt.taskIds.length, 0)} 项提交记录，可在对应回复清单或下方媒体卡片查看进度。`;
        } catch (error) { agentTurn.generationNotice = `批量生成未提交：${error instanceof Error ? error.message : '请检查清单设置'}`; }
      }
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
        case 'turn/snapshot': {
          const snapshot = readAgentTurnSnapshot(event.snapshot, agentTurn.turnId || turnId, threadId);
          if (!snapshot) throw new Error('对话快照与当前任务不匹配');
          items = restoreAgentTurnItems(items, snapshot);
          if (snapshot.modelUsed) agentTurn.modelUsed = snapshot.modelUsed;
          receivedTerminal = snapshot.status === 'completed';
          flushUpdate(true);
          break;
        }
        case 'turn/completed':
        case 'done':
          receivedTerminal = true;
          break;
        case 'turn/interrupted':
          throw new Error('本轮已中断，已生成内容已保留。');
        case 'error':
          items = finishInterruptedItems(items, false);
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
      if (receivedTerminal) break;
    }

    if (local.signal.aborted) {
      interruptAgentTurn(agentTurn.turnId || turnId);
      return;
    }
    if (!receivedTerminal) throw new Error('连接在模型回复完成前关闭');
    completeTask();
  } catch (streamErr: unknown) {
    if (local.signal.aborted) {
      interruptAgentTurn(agentTurn.turnId || turnId);
      return;
    }
    agentTurn.statusText = '连接暂时中断，正在恢复本轮结果…';
    flushUpdate(true);
    const snapshot = await recoverAgentTurn(agentTurn.turnId || turnId, threadId, local.signal, (saved) => {
      items = restoreAgentTurnItems(items, saved);
      if (saved.modelUsed) agentTurn.modelUsed = saved.modelUsed;
      flushUpdate(true);
    }).catch(() => null);
    if (local.signal.aborted) {
      interruptAgentTurn(agentTurn.turnId || turnId);
      return;
    }
    if (snapshot?.status === 'completed') {
      completeTask();
      return;
    }
    const msg = snapshot?.error || (snapshot?.status === 'interrupted' ? '本轮已中断，已生成内容已保留。'
      : streamErr instanceof Error ? streamErr.message : String(streamErr));
    items = finishInterruptedItems(items, false);
    const view = deriveTurnView(items);
    agentTurn.statusText = undefined;
    updateGenerationTask(task.id, {
      status: 'FAILURE',
      submissionRecoveryRequired: false,
      failReason: `读取模型回复中断: ${msg}`,
      agentTurn: { ...agentTurn, items: [...items], reply: view.content, thinking: view.thinking, toolActivity: view.toolActivity },
    });
  } finally {
    liveStops.delete(task.id);
    signal?.removeEventListener('abort', stop);
  }
}
