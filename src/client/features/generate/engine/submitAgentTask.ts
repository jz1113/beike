import { createUsageScope } from '@client/shared/utils/usageScope';
import { DEFAULT_MULTIMODAL_MODEL_ID } from '@shared/domain/models/modelCatalog';
import type { AssistantSSEEvent } from '@shared/domain/assistant/events';
import { useAppStore, type GenerationTask } from '@client/store';
import { apiFetch } from '@client/shared/api/apiClient';
import { readSseEvents } from '@client/shared/api/sseStream';
import { applyItemEvent, deriveTurnView, finishInterruptedItems } from '@client/shared/agent/turnItems';
import type { AssistantItem } from '@shared/domain/assistant/types';
import { visibleAgentPrompt, parseAgentAttachments } from '@client/shared/media/agentArtifact';
import type { AgentTurnTaskData, MediaAttachment } from '@client/store/appStoreTypes';
import { composeSkillCatalog, composeSkillRuntime } from '@shared/domain/assistant/skills';
import { loadPromptPreferences } from '@client/shared/prompt-bar/promptBarPreferencesTypes';
import { generationBatchContext, generationPromptSources } from '@client/shared/agent/generationBatchSources';
import { persistAssistantMedia } from '@client/shared/api/persistAssistantMedia';
import { shouldAnalyzeVideoDirectly } from '@shared/domain/assistant/mediaAnalysis';
import { executeGenerationBatchAction } from '@client/shared/agent/dispatchGenerationBatch';
import { readAgentTurnSnapshot, readProductWidget, recordAgentTaskUsage, recoverAgentTurn, restoreAgentTurnItems, type TaskUpdater } from './recoverAgentTurn';

/** Default system prompt for generation turns. There is no persona picker. */
export const DEFAULT_AGENT_SYSTEM_PROMPT = `你是贝壳云图的「全能创作总监 Agent」，参考 Codex 与 DeepSeek Hermes 的优秀交互与执行范式。
你的核心职责：
1. 具备清晰的规划意识：遇到复杂或多步骤任务时，优先使用 update_plan 工具拆解清晰的执行清单（待办/进行中/完成/受阻）；
2. 充分结合多模态素材：认真分析用户上传的图片、视频、音频或文档；
3. 输出高专业度、结构严密的创作结果（包括分镜脚本、视觉提示词、剧情大纲或执行排期）；
4. 当需要生成视觉画面或测试效果时，积极建议或调用工具落地。
硬规则：消息里已经有图片或文件时，本轮就基于这些素材交付。反推绘图提示词时，直接写出可复制的提示词，写明主体、服装与文字、姿态、光线、背景、镜头和风格。不要回答「请上传图片」。`;

export function resolveAgentSystemPrompt(): string {
  return DEFAULT_AGENT_SYSTEM_PROMPT;
}

function agentMessageAttachments(task: GenerationTask): MediaAttachment[] {
  return parseAgentAttachments(task).map((item) => ({
    name: item.name,
    type: item.kind === 'image' ? 'image' : item.kind === 'video' ? 'video' : 'document',
    url: item.url.startsWith('agent-file:') ? '' : item.url,
    extractedText: item.textSnippet || undefined,
  }));
}

/** Keep complete turns and their media within the current conversation. */
function priorAgentMessages(tasks: GenerationTask[], task: GenerationTask) {
  const prior = tasks.filter((item) =>
    item.id !== task.id
    && (item.mediaType === 'agent' || item.id.startsWith('agent-task-'))
    && item.sessionId === task.sessionId
    && (item.createdAt || 0) <= (task.createdAt || 0),
  ).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(-10);
  const messages: Array<{ role: 'user' | 'assistant'; content: string; attachments?: MediaAttachment[] }> = [];
  for (const item of prior) {
    const content = visibleAgentPrompt(item.prompt || '');
    // Local preview URLs cannot survive a page reload; only resend saved media.
    const attachments = agentMessageAttachments(item).filter((attachment) =>
      attachment.extractedText || /^\/storage\//.test(attachment.url) || /^https?:\/\//.test(attachment.url),
    );
    if (content || attachments.length) messages.push({ role: 'user', content, attachments });
    const reply = item.agentTurn?.reply?.trim() || item.agentTurn?.items
      ?.filter((entry) => entry.kind === 'agentMessage')
      .map((entry) => entry.content).join('\n\n').trim();
    if (reply) messages.push({ role: 'assistant', content: reply });
  }
  return messages;
}

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
  if (task?.model !== 'direct-collection') interruptAgentTurn(task?.agentTurn?.turnId || task?.taskId);
  useAppStore.getState().updateGenerationTask(taskId, {
    status: 'FAILURE',
    submissionRecoveryRequired: false,
    failReason: '已停止生成',
  });
}

async function submitProductCollection(task: GenerationTask, update: TaskUpdater, signal?: AbortSignal) {
  const controller = new AbortController();
  liveStops.set(task.id, controller);
  const timeout = AbortSignal.timeout(60_000);
  const requestSignal = signal ? AbortSignal.any([controller.signal, timeout, signal]) : AbortSignal.any([controller.signal, timeout]);
  update(task.id, { status: 'IN_PROGRESS', progress: '15%', failReason: undefined, agentTurn: { modelUsed: 'direct-collection', statusText: '正在查询商品资料，缓存未命中时需等待采集服务返回…' } });
  try {
    const prompt = task.prompt.trim();
    const refresh = /^重新采集\s+京东\s+(\d{7,20})$/.exec(prompt);
    const response = await apiFetch('/api/catalog/collect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(refresh ? { url: refresh[1], platform: 'jd', forceRefresh: true } : { url: prompt, platform: 'auto' }), signal: requestSignal,
    });
    const data = await response.json();
    const product = data?.product;
    const widget = readProductWidget(product && { ...product, allImages: product.images || product.allImages, apiUsed: data.apiUsed });
    if (!response.ok || data?.success !== true || !widget) throw new Error(data?.error || '未获取到完整商品信息');
    const reply = data.fromCache === true ? '已复用商品采集结果，未重复调用采集服务或 AI 模型。' : '商品采集完成，未调用 AI 模型。';
    update(task.id, { status: 'SUCCESS', progress: '100%', submissionRecoveryRequired: false,
      agentTurn: { modelUsed: 'direct-collection', reply, productWidget: widget } });
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = signal?.aborted ? '采集连接已中断，结果未确认；请检查商品库后再重试' : timeout.aborted ? '采集超时，结果未确认；请检查商品库后再重试' : error instanceof Error ? error.message : '采集失败，请稍后重试';
    update(task.id, { status: 'FAILURE', progress: '0%', submissionRecoveryRequired: false,
      failReason: message, agentTurn: { modelUsed: 'direct-collection', reply: `商品采集失败：${message}` } });
  } finally {
    liveStops.delete(task.id);
  }
}

export async function submitAgentTask(
  task: GenerationTask,
  updateGenerationTask: TaskUpdater,
  signal?: AbortSignal,
) {
  if (task.model === 'direct-collection') return submitProductCollection(task, updateGenerationTask, signal);
  const store = useAppStore.getState();
  const rawModel = task.modelRouteKey || task.model || store.assistantModel || DEFAULT_MULTIMODAL_MODEL_ID;
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
  let dispatched = false;
  let usageScope = task.usageScope;
  const requireRecovery = (message: string) => updateGenerationTask(task.id, {
    status: 'IN_PROGRESS', submissionRecoveryRequired: true,
    failReason: `${message}；正在核对原对话结果，不会重复提交`,
    agentTurn: { ...agentTurn, statusText: '正在恢复原对话结果…' },
  });
  try {
    const attachments = await persistAssistantMedia(agentMessageAttachments(task), local.signal);
    if (attachments.length) updateGenerationTask(task.id, { referenceImages: attachments.map((item, index) => item.url || task.referenceImages?.[index] || '') });
    const skillRuntime = composeSkillRuntime(store.getActiveAssistantSkill());
    const prefs = loadPromptPreferences();
    const messages = [
      ...priorAgentMessages([...new Map([...store.sessions.flatMap((session) => session.tasks), ...store.generationTasks].map((item) => [item.id, item])).values()], task),
      { role: 'user', content: currentPrompt || (attachments.length ? '请分析上传的素材。' : '你好'), attachments },
    ];
    const directVideo = shouldAnalyzeVideoDirectly(messages, skillRuntime?.skillId);
    const requestBody: Record<string, unknown> = {
      turnId,
      threadId,
      model,
      messages,
      enableAgentTools: !directVideo,
      systemPrompt: [resolveAgentSystemPrompt(), skillRuntime?.systemPrompt || ''].filter(Boolean).join('\n\n'),
      generationMode: 'auto',
      clientContext: { currentView: 'generate', generationBatches: generationBatchContext(generationPromptSources(store, 'agent', threadId, task.id)) },
      reasoningEffort: prefs.reasoning?.reasoningEffort || 'medium',
    };
    if (skillRuntime) {
      requestBody.skillId = skillRuntime.skillId;
      if (skillRuntime.allowedTools?.length) requestBody.allowedTools = skillRuntime.allowedTools;
      if (skillRuntime.resources.length) requestBody.skillResources = skillRuntime.resources;
    }
    const skillCatalog = composeSkillCatalog(store.getAllAssistantSkills());
    if (!directVideo && skillCatalog.length) requestBody.skillCatalog = skillCatalog;

    usageScope ||= createUsageScope('chat', model);
    updateGenerationTask(task.id, { usageScope });
    dispatched = true;
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
    if (dispatched) { requireRecovery(`提交回执未确认: ${msg}`); return; }
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
    let unknown = response.status >= 500 || response.status === 408 || response.status === 409 || response.ok;
    try {
      const errJson = await response.json();
      if (errJson.error) errMsg = errJson.error;
      unknown ||= errJson.submissionUnknown === true;
    } catch { /* keep the status text */ }
    if (unknown) { requireRecovery(errMsg); return; }
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
    for await (const event of readSseEvents<AssistantSSEEvent>(response.body, local.signal)) {
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
        case 'usage':
          recordAgentTaskUsage({ usageScope }, agentTurn.turnId || turnId, agentTurn.modelUsed || model, event.usage);
          break;
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
          agentTurn.productWidget = readProductWidget(event.productWidget) || agentTurn.productWidget;
          if (event.modelUsed) agentTurn.modelUsed = event.modelUsed;
          break;
        case 'turn/snapshot': {
          const snapshot = readAgentTurnSnapshot(event.snapshot, agentTurn.turnId || turnId, threadId);
          if (!snapshot) throw new Error('对话快照与当前任务不匹配');
          recordAgentTaskUsage({ usageScope }, agentTurn.turnId || turnId, snapshot.modelUsed || agentTurn.modelUsed || model, snapshot.usage);
          items = restoreAgentTurnItems(items, snapshot);
          agentTurn.productWidget = snapshot.productWidget || agentTurn.productWidget;
          if (snapshot.modelUsed) agentTurn.modelUsed = snapshot.modelUsed;
          receivedTerminal = snapshot.status === 'completed';
          flushUpdate(true);
          break;
        }
        case 'turn/completed':
          recordAgentTaskUsage({ usageScope }, agentTurn.turnId || turnId, agentTurn.modelUsed || model, event.usage);
          receivedTerminal = true;
          break;
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
      recordAgentTaskUsage({ usageScope }, agentTurn.turnId || turnId, saved.modelUsed || agentTurn.modelUsed || model, saved.usage);
      items = restoreAgentTurnItems(items, saved);
      agentTurn.productWidget = saved.productWidget || agentTurn.productWidget;
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
    if (!snapshot || snapshot.status === 'running' || snapshot.status === 'awaiting_approval') {
      requireRecovery('原对话结果暂时无法确认');
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
