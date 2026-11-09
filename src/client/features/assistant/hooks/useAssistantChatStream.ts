import type { AppState, AssistantSession } from '@client/store';
import { generationBatchContext, generationPromptSources } from '@client/shared/agent/generationBatchSources';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import type { AssistantRunMode, ReferenceScope } from '@shared/domain/assistant/taskPolicy';
import { persistAssistantMedia } from '@client/shared/api/persistAssistantMedia';
import { useState, useRef, useMemo, useEffect } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import {
  deriveLegacyState,
  finishInterruptedItems,
  readAssistantRetryDecision,
  readAssistantTurnReceipt,
  recordAssistantChatUsage,
  saveAssistantTurnReceipt,
  snapshotAssistantSkill,
} from '../model/assistantActivity';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { buildBrandKitSystemPrompt } from '@shared/domain/products/brandKitModels';
import { composeSkillCatalog, composeSkillRuntime, withSkillFileTool } from '@shared/domain/assistant/skills';
import { useAppStore, AssistantMessage, MediaAttachment } from '@client/store';
import { useAssistantTurn } from '@client/features/assistant/hooks/useAssistantTurn';
import type { PendingApproval } from '@client/features/assistant/model/assistantTurnTypes';
import { normalizeAssistantItems, normalizeAssistantTask } from '@shared/domain/assistant/normalizeAssistantItems';
import { assistantMessageSchema } from '@shared/contracts/assistant';

/** Coalesce partial snapshots without dropping fields or delaying final state. */
function createStreamPatchBatcher<T extends object>(commit: (patch: Partial<T>) => void, delay = 32) {
  let pending: Partial<T> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const patch = pending;
    pending = null;
    if (patch) commit(patch);
  };
  return {
    push(patch: Partial<T>) {
      pending = {...pending, ...patch};
      if (timer === undefined) timer = setTimeout(flush, delay);
    },
    flush,
  };
}

function validateAssistantSubmission(content: string, attachments: MediaAttachment[], systemPrompt = ''): string | undefined {
  if (content.length > 100_000) return '单条消息最多 100000 字符，请缩短内容或作为文档上传；草稿已保留';
  if (attachments.length > 50) return '每条消息最多 50 个附件，请分批发送；草稿已保留';
  if (systemPrompt.length > 100_000) return '技能与品牌指令过长，请缩短配置后再发送；草稿已保留';
  const parsed = assistantMessageSchema.safeParse({ role: 'user', content, attachments });
  return parsed.success ? undefined : '附件名称、地址或正文超出支持范围，请调整后再发送；草稿已保留';
}

function buildAssistantRequestMessages(messages: AssistantMessage[]) {
  const requestMessages = messages.slice(-500).map((message) => ({
    id: message.id, timestamp: message.timestamp, error: message.error,
    role: message.role, content: message.content || '',
    productWidget: message.role === 'assistant' ? message.productWidget : undefined,
    attachments: message.attachments?.length ? message.attachments.map((attachment) => ({
      type: attachment.type, url: attachment.type === 'document' ? undefined : attachment.url,
      name: attachment.name, mentionName: attachment.mentionName, extractedText: attachment.extractedText,
    })) : undefined,
  }));
  for (const message of requestMessages) {
    if (!assistantMessageSchema.safeParse(message).success) throw new Error('历史消息超出支持范围，请新建会话或调整对应附件；本次草稿已保留');
  }
  if (new TextEncoder().encode(JSON.stringify(requestMessages)).byteLength > 31_000_000) {
    throw new Error('当前对话素材过多，请新建会话并引用所需文件；本次草稿已保留');
  }
  return requestMessages;
}

interface UseAssistantChatStreamOptions {
  currentSession: AssistantSession;
  runMode?: AssistantRunMode;
  referenceScope?: ReferenceScope;
  assistantModel: string;
  reasoningEffort?: ReasoningEffort;
  assistantHistoryLimit: number;
  sessionAllowedTools?: string[];
  selectedLang: string;
  assistantAttachments: MediaAttachment[];
  clearAssistantAttachments: () => void;
  addAssistantMessage: (sessionId: string, msg: AssistantMessage) => void;
  updateAssistantMessage: (sessionId: string, msgId: string, patch: Partial<AssistantMessage>) => void;
  currentView: string;
  product: AppState['product'];
  selectedArchId: AppState['selectedArchId'];
  activeBrandKit: ReturnType<AppState['getActiveBrandKit']>;
  getWorkspaceSnapshot?: () => Record<string, unknown> | undefined;
  /** 由当前工作区显式选中的视觉节点；只在新消息时作为参考素材随本轮发送。 */
  getWorkspaceAttachments?: () => MediaAttachment[] | undefined;
  getActiveAssistantSkill: AppState['getActiveAssistantSkill'];
  showToast: (msg: string) => void;
}

export function useAssistantChatStream({
  currentSession,
  runMode = 'auto',
  referenceScope = 'auto',
  assistantModel,
  reasoningEffort = 'medium',
  assistantHistoryLimit,
  sessionAllowedTools,
  selectedLang,
  assistantAttachments,
  clearAssistantAttachments,
  addAssistantMessage,
  updateAssistantMessage,
  currentView,
  product,
  selectedArchId,
  activeBrandKit,
  getWorkspaceSnapshot,
  getWorkspaceAttachments,
  getActiveAssistantSkill,
  showToast,
}: UseAssistantChatStreamOptions) {
  const [sendingSessionId, setSendingSessionId] = useState<string | null>(null);
  const [livePendingApprovals, setLivePendingApprovals] = useState<PendingApproval[]>([]);
  const [streamingAssistantMsgId, setStreamingAssistantMsgId] = useState<string | null>(null);
  const sendingGuard = useRef(false);
  const retryVerificationGuard = useRef(false);
  const sessionApprovalsRef = useRef(new Map<string, string[]>());
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  const { runTurn, handleApprovalDecision, getItems, turnIdRef } = useAssistantTurn();
  const runTurnHook = useMemo(() => ({ getItems }), [getItems]);

  const isSending = Boolean(sendingSessionId);
  const isSendingCurrent = sendingSessionId === currentSession?.id;

  // 发送消息 (SSE 流式逐字输出)
  const handleSendMessage = async (
    textToSend?: string,
    options?: { retryAssistantId?: string; onSubmitted?: () => void }
  ) => {
    if (sendingSessionId || sendingGuard.current || retryVerificationGuard.current) return;
    const retryAssistantId = options?.retryAssistantId;
    let retryUserMsg: AssistantMessage | undefined;

    if (retryAssistantId) {
      const sess = useAppStore.getState().assistantSessions.find((s) => s.id === currentSession.id);
      const msgs = sess?.messages || [];
      const failIdx = msgs.findIndex((m) => m.id === retryAssistantId);
      if (failIdx < 0) return;
      const previousTurnId = msgs[failIdx].turnId || readAssistantTurnReceipt(currentSession.id, retryAssistantId);
      if (!previousTurnId) {
        showToast('缺少原任务标识，无法核实执行结果，已阻止重复提交');
        return;
      }
      if (previousTurnId) {
        retryVerificationGuard.current = true;
        try {
          const decision = await readAssistantRetryDecision(previousTurnId, currentSession.id, url => apiFetch(url));
          if (decision.kind === 'blocked') { showToast(decision.message); return; }
          if (decision.kind === 'completed') {
            const snapshot = decision.snapshot;
            snapshot.items = normalizeAssistantItems(snapshot.items);
            updateAssistantMessage(currentSession.id, retryAssistantId, {
              items: snapshot.items,
              task: normalizeAssistantTask(snapshot.task),
              ...deriveLegacyState(snapshot.items),
              modelUsed: snapshot.modelUsed, turnId: previousTurnId,
              error: false, interruptionReason: undefined, streamingStatus: undefined,
            });
            useAppStore.getState().persistAssistantNow();
            showToast('已找回执行结果，没有重新调用模型');
            return;
          }

        } catch {
          showToast('暂时无法核实原任务结果，已阻止重复提交，请恢复连接后再试');
          return;
        } finally {
          retryVerificationGuard.current = false;
        }
      }
      retryUserMsg = [...msgs.slice(0, failIdx)].reverse().find((m) => m.role === 'user');
      if (!retryUserMsg) {
        showToast('找不到可重试的用户消息');
        return;
      }
    }

    let text = retryUserMsg
      ? (retryUserMsg.content || '').trim()
      : (textToSend !== undefined ? textToSend : '').trim();
    if (!retryUserMsg && !text && assistantAttachments.length === 0) return;
    if (retryUserMsg && !text && !retryUserMsg.attachments?.length) return;
    // 同一会话禁止并发发送；其他会话可查看历史，全局仍只允许一路流
    if (sendingSessionId || sendingGuard.current) return;
    if (!useAppStore.getState().assistantSessions.some((session) => session.id === currentSession.id)) {
      showToast('当前会话已不存在，请新建对话后再发送');
      return;
    }

    const selectedSkill = getActiveAssistantSkill();
    const usedSkill = retryUserMsg
      ? retryUserMsg.usedSkill
      : snapshotAssistantSkill(selectedSkill);
    const skillRuntime = usedSkill;
    const allSkills = useAppStore.getState().getAllAssistantSkills();
    const skillResources = usedSkill?.resources ?? composeSkillRuntime(
      allSkills.find((item) => item.id === skillRuntime?.skillId),
    )?.resources;
    const skillCatalog = composeSkillCatalog(allSkills);

    // 绑定发送时会话，避免中途切换导致串台
    const sessionId = currentSession.id;

    const workspaceAttachments = retryUserMsg ? [] : (getWorkspaceAttachments?.() || []);
    let attachmentsToSend = retryUserMsg
      ? [...(retryUserMsg.attachments || [])]
      : [...assistantAttachments, ...workspaceAttachments.filter((candidate) =>
          !assistantAttachments.some((attachment) => attachment.url === candidate.url),
        )];
    const brandKitPrompt = buildBrandKitSystemPrompt(activeBrandKit);
    const combinedSystemPrompt = [brandKitPrompt, skillRuntime?.systemPrompt].filter(Boolean).join('\n\n');
    const invalidSubmission = validateAssistantSubmission(text, attachmentsToSend, combinedSystemPrompt);
    if (invalidSubmission) { showToast(invalidSubmission); return; }
    sendingGuard.current = true;
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;
    setSendingSessionId(sessionId);
    try {
      attachmentsToSend = await persistAssistantMedia(attachmentsToSend, abortCtrl.signal);
      abortCtrl.signal.throwIfAborted();
      if (useAppStore.getState().currentAssistantSessionId !== sessionId || !useAppStore.getState().assistantSessions.some((session) => session.id === sessionId)) {
        throw new Error('会话已切换，原草稿已保留，请返回原会话发送');
      }
    } catch (error) {
      sendingGuard.current = false;
      setSendingSessionId(null);
      abortControllerRef.current = null;
      if (!abortCtrl.signal.aborted) showToast(error instanceof Error ? error.message : '素材保存失败，请重试');
      return;
    }
    if (!text && attachmentsToSend.some((a) => a.type === 'document')) {
      text = '请阅读附件文档，总结核心要点，并提取可执行建议。';
    } else if (!text && attachmentsToSend.length > 0) {
      text = '请分析附带的素材。';
    }

    let userMsg: AssistantMessage;
    let assistantMsgId: string;
    const submittedMessageId = retryUserMsg?.id || `msg-${Date.now()}-user`;
    const existingMessages = useAppStore.getState().assistantSessions.find((session) => session.id === sessionId)?.messages || [];
    const retryIndex = retryUserMsg ? existingMessages.findIndex((message) => message.id === retryUserMsg.id) : -1;
    let allMsgs: ReturnType<typeof buildAssistantRequestMessages>;
    try {
      allMsgs = buildAssistantRequestMessages([
        ...(retryIndex >= 0 ? existingMessages.slice(0, retryIndex) : existingMessages),
        { id: submittedMessageId, role: 'user', content: text, attachments: attachmentsToSend, timestamp: Date.now() },
      ]);
    } catch (error) {
      sendingGuard.current = false;
      setSendingSessionId(null);
      abortControllerRef.current = null;
      showToast(error instanceof Error ? error.message : '消息无法提交；草稿已保留');
      return;
    }

    if (retryAssistantId && retryUserMsg) {
      userMsg = { ...retryUserMsg, content: text || retryUserMsg.content, attachments: attachmentsToSend };
      updateAssistantMessage(sessionId, userMsg.id, { attachments: attachmentsToSend });
      assistantMsgId = retryAssistantId;
      updateAssistantMessage(sessionId, assistantMsgId, {
        content: '',
        error: false,
        interruptionReason: undefined,
        items: undefined,
        task: undefined,
        thinking: undefined,
        streamingStatus: undefined,
        modelUsed: undefined,
        toolActivity: undefined,
        turnId: undefined,
        productWidget: undefined,
        timestamp: Date.now(),
      });
    } else {
      // 构建并追加用户消息
      userMsg = {
        id: submittedMessageId,
        role: 'user',
        usedSkill,
        runMode,
        referenceScope,
        content: text,
        attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
        timestamp: Date.now(),
      };

      addAssistantMessage(sessionId, userMsg);
      const submittedAttachments = new Set(assistantAttachments);
      const remaining = useAppStore.getState().assistantAttachments.filter((attachment) => !submittedAttachments.has(attachment));
      if (remaining.length) useAppStore.getState().setAssistantAttachments(remaining);
      else clearAssistantAttachments();
      options?.onSubmitted?.();
      // 只清除本次实际发送的选择，不覆盖上传期间新选的技能。
      if (usedSkill && useAppStore.getState().getActiveAssistantSkill()?.id === usedSkill.skillId) {
        useAppStore.getState().setActiveAssistantSkillId(null);
      }

      assistantMsgId = `msg-${Date.now()}-asst`;
      const placeholderMsg: AssistantMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        // 首帧即给出与当前工作区一致的真实准备状态；服务端后续 status 事件会覆盖它。
        streamingStatus: currentView === 'canvas' ? '正在读取当前画布，准备回应…' : '正在准备回应…',
        timestamp: Date.now(),
      };
      addAssistantMessage(sessionId, placeholderMsg);
    }

    setStreamingAssistantMsgId(assistantMsgId);
    turnIdRef.current = null;

    const streamUpdates = createStreamPatchBatcher<AssistantMessage>(patch => updateAssistantMessage(sessionId, assistantMsgId, patch));
    let preparedTurnId: string | undefined;

    try {
      setLivePendingApprovals([]);

      abortCtrl.signal.throwIfAborted();
      const finalState = await runTurn({
        sessionId,
        assistantMsgId,
        messages: allMsgs,
        model: assistantModel,
        reasoningEffort,
        fallbackModels: [],
        historyLimit: assistantHistoryLimit,
        runMode: userMsg.runMode || 'auto',
        referenceScope: userMsg.referenceScope || 'auto',
        systemPrompt: combinedSystemPrompt,
        skillId: skillRuntime?.skillId,
        allowedTools: withSkillFileTool(sessionAllowedTools === undefined
          ? skillRuntime?.allowedTools
          : skillRuntime?.allowedTools === undefined ? sessionAllowedTools : sessionAllowedTools.filter((name) => skillRuntime.allowedTools!.includes(name)), skillResources),
        skillResources,
        skillCatalog,
        language: selectedLang,
        clientContext: {
          generationBatches: generationBatchContext(generationPromptSources(useAppStore.getState(), 'assistant', sessionId, assistantMsgId)),
          currentView,
          productTitle: product?.title,
          productItemId: product?.itemId,
          selectedArchId,
          workspaceSnapshot: getWorkspaceSnapshot?.(),
        },
        sessionApprovals: sessionApprovalsRef.current.get(sessionId) || [],
        signal: abortCtrl.signal,
        showToast,
        onTurnPrepared: (turnId) => {
          preparedTurnId = turnId;
          updateAssistantMessage(sessionId, assistantMsgId, { turnId });
          saveAssistantTurnReceipt(sessionId, assistantMsgId, turnId);
          useAppStore.getState().persistAssistantNow();
        },
        onUpdate: (patch) => {
          if (patch.pendingApprovals) setLivePendingApprovals(patch.pendingApprovals);
          if (patch.sessionApprovals) sessionApprovalsRef.current.set(sessionId, patch.sessionApprovals);
          const msgPatch: Partial<AssistantMessage> = { error: false, turnId: turnIdRef.current || undefined };
          if (patch.task !== undefined) msgPatch.task = patch.task;
          if (patch.content !== undefined) msgPatch.content = patch.content;
          if (patch.thinking !== undefined) msgPatch.thinking = patch.thinking;
          if (patch.toolActivity !== undefined) msgPatch.toolActivity = patch.toolActivity;
          if (patch.productWidget !== undefined) msgPatch.productWidget = patch.productWidget;
          if (patch.modelUsed !== undefined) msgPatch.modelUsed = patch.modelUsed;
          if ('streamingStatus' in patch) msgPatch.streamingStatus = patch.streamingStatus;
          const items = runTurnHook.getItems();
          if (items) {
            msgPatch.items = [...items];
          }
          streamUpdates.push(msgPatch);
        },
      });

      streamUpdates.flush();
      const accumulated = finalState.content;
      const modelUsed = finalState.modelUsed || assistantModel;
      const productWidget = finalState.productWidget;

      updateAssistantMessage(sessionId, assistantMsgId, {
        task: finalState.task,
        content: accumulated || '抱歉，暂时未能解析出内容。',
        modelUsed,
        productWidget,
        thinking: finalState.thinking,
        toolActivity: finalState.toolActivity,
        streamingStatus: undefined,
      });
      setLivePendingApprovals([]);

      recordAssistantChatUsage(modelUsed, finalState.usage, preparedTurnId || '');

      useAppStore.getState().persistAssistantNow();
    } catch (err: unknown) {
      streamUpdates.flush();
      if (abortCtrl.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        const message = useAppStore.getState().assistantSessions.find((session) => session.id === sessionId)?.messages.find((item) => item.id === assistantMsgId);
        const items = finishInterruptedItems(message?.items || [], true);
        updateAssistantMessage(sessionId, assistantMsgId, {
          ...(items.length ? { items, ...deriveLegacyState(items) } : { content: (message?.content || '') + '\n\n⏹ *用户已停止生成*' }),
          turnId: preparedTurnId, streamingStatus: undefined, error: false, interruptionReason: undefined,
        });
      } else {
        const partial = useAppStore.getState().assistantSessions.find((s) => s.id === sessionId)
          ?.messages.find((m) => m.id === assistantMsgId)?.content || '';
        updateAssistantMessage(sessionId, assistantMsgId, {
          content: partial,
          turnId: preparedTurnId,
          interruptionReason: formatUserError(err, '连接中断，执行结果尚未确认。点击重试将先查询原任务，避免重复扣费。'),
          streamingStatus: undefined,
          error: true,
        });
      }
      useAppStore.getState().persistAssistantNow();
    } finally {
      streamUpdates.flush();
      setLivePendingApprovals([]);
      sendingGuard.current = false;
      setSendingSessionId(null);
      setStreamingAssistantMsgId(null);
      abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      if (streamingAssistantMsgId && turnIdRef.current) {
        void apiFetch('/api/assistant/turn/interrupt', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ turnId: turnIdRef.current }),
        }).catch(() => undefined);
      }
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  return {
    sendingSessionId,
    streamingAssistantMsgId,
    livePendingApprovals,
    setLivePendingApprovals,
    isSending,
    isSendingCurrent,
    handleSendMessage,
    handleStopGeneration,
    handleApprovalDecision,
  };
}
