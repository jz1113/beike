import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import type { AssistantRunMode, ReferenceScope } from '@shared/domain/assistant/taskPolicy';
import { persistAssistantImages } from '../utils/persistAssistantImages';
import { useState, useRef, useMemo, useEffect } from 'react';
import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { extractVideoFramesFromSrc, isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { recordModelUsage, resolveModelVendor } from '@client/shared/utils/usageTracker';
import { formatUserError } from '@shared/domain/models/upstreamErrors';
import { buildBrandKitSystemPrompt } from '@shared/domain/products/brandKitModels';
import { composeSkillRuntime } from '@shared/domain/assistant/skills';
import { useAppStore, AssistantMessage, MediaAttachment } from '@client/store';
import { useAssistantTurn } from '@client/features/assistant/hooks/useAssistantTurn';
import type { PendingApproval } from '@client/features/assistant/utils/assistantTurnTypes';
import { createStreamPatchBatcher } from './streamPatchBatcher';

interface UseAssistantChatStreamOptions {
  currentSession: any;
  runMode?: AssistantRunMode;
  referenceScope?: ReferenceScope;
  assistantModel: string;
  reasoningEffort?: ReasoningEffort;
  assistantHistoryLimit: number;
  selectedLang: string;
  assistantAttachments: MediaAttachment[];
  clearAssistantAttachments: () => void;
  addAssistantMessage: (sessionId: string, msg: AssistantMessage) => void;
  updateAssistantMessage: (sessionId: string, msgId: string, patch: Partial<AssistantMessage>) => void;
  currentView: string;
  currentStep: any;
  product: any;
  selectedArchId: any;
  workshopMode: any;
  activeWorkshopTab: any;
  activeBrandKit: any;
  getWorkspaceSnapshot?: () => Record<string, unknown> | undefined;
  /** 由当前工作区显式选中的视觉节点；只在新消息时作为参考素材随本轮发送。 */
  getWorkspaceAttachments?: () => MediaAttachment[] | undefined;
  getActiveAssistantSkill: () => any;
  showToast: (msg: string) => void;
}

export function useAssistantChatStream({
  currentSession,
  runMode = 'auto',
  referenceScope = 'auto',
  assistantModel,
  reasoningEffort = 'medium',
  assistantHistoryLimit,
  selectedLang,
  assistantAttachments,
  clearAssistantAttachments,
  addAssistantMessage,
  updateAssistantMessage,
  currentView,
  currentStep,
  product,
  selectedArchId,
  workshopMode,
  activeWorkshopTab,
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
  const sessionApprovalsRef = useRef<string[]>([]);
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
    options?: { retryAssistantId?: string }
  ) => {
    const retryAssistantId = options?.retryAssistantId;
    let retryUserMsg: AssistantMessage | undefined;

    if (retryAssistantId) {
      const sess = useAppStore.getState().assistantSessions.find((s) => s.id === currentSession.id);
      const msgs = sess?.messages || [];
      const failIdx = msgs.findIndex((m) => m.id === retryAssistantId);
      if (failIdx < 0) return;
      const previousTurnId = msgs[failIdx].turnId;
      if (previousTurnId) {
        try {
          const response = await apiFetch(`/api/assistant/turns/${encodeURIComponent(previousTurnId)}/snapshot`);
          const data = await response.json();
          const snapshot = data.snapshot;
          if (!response.ok || !snapshot) throw new Error('无法核实');
          if (snapshot.status === 'completed') {
            updateAssistantMessage(currentSession.id, retryAssistantId, {
              items: snapshot.items,
              task: snapshot.task,
              content: snapshot.items.filter((item: any) => item.kind === 'agentMessage').map((item: any) => item.content || '').join('\n\n'),
              error: false, interruptionReason: undefined, streamingStatus: undefined,
            });
            showToast('已找回执行结果，没有重新调用模型');
            return;
          }
          if (!['failed', 'cancelled', 'interrupted'].includes(snapshot.status)) {
            showToast('原任务尚未确认失败，请稍后再检查；为避免重复扣费，本次不会重新提交');
            return;
          }
        } catch {
          showToast('暂时无法核实原任务结果，已阻止重复提交，请恢复连接后再试');
          return;
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

    const selectedSkill = getActiveAssistantSkill();
    const selectedRuntime = composeSkillRuntime(selectedSkill);
    const usedSkill = retryUserMsg
      ? retryUserMsg.usedSkill
      : selectedRuntime ? { ...selectedRuntime, name: selectedSkill.displayName || selectedSkill.name } : undefined;
    const skillRuntime = usedSkill;

    // 绑定发送时会话，避免中途切换导致串台
    const sessionId = currentSession.id;

    const workspaceAttachments = retryUserMsg ? [] : (getWorkspaceAttachments?.() || []);
    let attachmentsToSend = retryUserMsg
      ? [...(retryUserMsg.attachments || [])]
      : [...assistantAttachments, ...workspaceAttachments.filter((candidate) =>
          !assistantAttachments.some((attachment) => attachment.url === candidate.url),
        )];
    sendingGuard.current = true;
    setSendingSessionId(sessionId);
    try {
      attachmentsToSend = await persistAssistantImages(attachmentsToSend);
    } catch (error) {
      sendingGuard.current = false;
      setSendingSessionId(null);
      showToast(error instanceof Error ? error.message : '图片保存失败，请重试');
      return;
    }
    if (!text && attachmentsToSend.some((a) => a.type === 'document')) {
      text = '请阅读附件文档，总结核心要点，并提取可执行建议。';
    } else if (!text && attachmentsToSend.length > 0) {
      text = '请分析附带的素材。';
    }

    let userMsg: AssistantMessage;
    let assistantMsgId: string;

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
        productWidget: undefined,
        timestamp: Date.now(),
      });
    } else {
      // 构建并追加用户消息
      userMsg = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        usedSkill,
        runMode,
        referenceScope,
        content: text,
        attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
        timestamp: Date.now(),
      };

      addAssistantMessage(sessionId, userMsg);
      clearAssistantAttachments();
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

    setSendingSessionId(sessionId);
    setStreamingAssistantMsgId(assistantMsgId);

    // 创建 AbortController 以支持取消
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;
    const streamUpdates = createStreamPatchBatcher<AssistantMessage>(patch => updateAssistantMessage(sessionId, assistantMsgId, patch));

    try {
      /** 视频抽帧；文档带 extractedText；图片原样 */
      const expandAttachmentsForApi = async (
        atts: MediaAttachment[] | undefined,
        isLatestUser: boolean
      ): Promise<Array<{ type: string; url?: string; name?: string; mentionName?: string; extractedText?: string }>> => {
        if (!atts || atts.length === 0) return [];
        if (!isLatestUser) {
          return atts
            .map((a) => ({
              type: a.type,
              url: a.type === 'document' ? undefined : a.thumbnailUrl || a.url,
              name: a.name, mentionName: a.mentionName,
            }))
            .filter((a) => a.type === 'document' || Boolean(a.url));
        }

        const out: Array<{ type: string; url?: string; name?: string; mentionName?: string; extractedText?: string }> = [];
        for (const a of atts) {
          if (a.type === 'document') {
            if (a.extractedText) {
              out.push({
                type: 'document',
                name: a.name || '文档',
                extractedText: a.extractedText,
              });
            }
            continue;
          }

          if (a.type !== 'video') {
            if (a.url) out.push({ type: 'image', url: a.url, name: a.name, mentionName: a.mentionName });
            continue;
          }

          const proxySrc =
            a.url.startsWith('data:') || a.url.startsWith('blob:') || a.url.startsWith('/')
              ? a.url
              : proxyMediaUrl(a.url);

          let frames: string[] = [];
          try {
            frames = await extractVideoFramesFromSrc(proxySrc, 6);
          } catch {
            frames = [];
          }

          if (frames.length > 0) {
            frames.forEach((f, i) => {
              out.push({ type: 'image', url: f, name: `视频帧${i + 1}` });
            });
          } else if (a.thumbnailUrl) {
            out.push({ type: 'image', url: a.thumbnailUrl, name: a.name || '视频封面' });
          } else if (a.url && !isVideoMediaUrl(a.url)) {
            out.push({ type: 'image', url: a.url, name: a.name || '视频封面' });
          }
        }
        return out.filter((x) => (x.type === 'document' ? Boolean(x.extractedText) : Boolean(x.url)));
      };

      const latestUserId = userMsg.id;
      const sessMsgs =
        useAppStore.getState().assistantSessions.find((s) => s.id === sessionId)?.messages ||
        currentSession?.messages ||
        [];
      const thread = retryAssistantId
        ? (() => {
            const uIdx = sessMsgs.findIndex((m: any) => m.id === userMsg.id);
            return uIdx >= 0
              ? sessMsgs.slice(0, uIdx + 1)
              : [...sessMsgs.filter((m: any) => m.id !== retryAssistantId), userMsg];
          })()
        : [...sessMsgs.filter((m: AssistantMessage) => m.id !== assistantMsgId && m.id !== userMsg.id), userMsg];

      const allMsgs = await Promise.all(
        thread.map(async (m: any) => {
          const isLatestUser = m.id === latestUserId && m.role === 'user';
          const expanded = await expandAttachmentsForApi(m.attachments, isLatestUser);
          let content = m.content || '';
          if (isLatestUser && m.attachments?.some((a: any) => a.type === 'video')) {
            const frameHint = expanded.some((a) => (a.name || '').startsWith('视频帧'))
              ? '\n【系统：本轮含原视频，已均匀抽取多帧画面供视觉分析，请结合镜头节奏与产品动态作答】'
              : '\n【系统：本轮含原视频，抽帧失败，请结合封面/用户描述尽量分析】';
            content = `${content}${frameHint}`;
          }
          if (isLatestUser && m.attachments?.some((a: any) => a.type === 'document')) {
            content = `${content}\n【系统：本轮含文档附件，正文已抽取为文本注入，请仔细阅读文档内容后作答】`;
          }
          return {
            id: m.id,
            timestamp: m.timestamp,
            error: m.error,
            role: m.role,
            content,
            thinking: m.role === 'assistant' ? m.thinking || m.items?.filter((item: { kind: string }) => item.kind === 'agentReasoning').map((item: { content?: string }) => item.content || '').join('\n\n') : undefined,
            productWidget: m.role === 'assistant' ? m.productWidget : undefined,
            attachments: expanded.length > 0 ? expanded : undefined,
          };
        })
      );

      const brandKitPrompt = buildBrandKitSystemPrompt(activeBrandKit);
      const combinedSystemPrompt = [brandKitPrompt, skillRuntime?.systemPrompt]
        .filter(Boolean)
        .join('\n\n');

      setLivePendingApprovals([]);

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
        allowedTools: skillRuntime?.allowedTools,
        language: selectedLang,
        clientContext: {
          currentView,
          workshopStep: currentStep,
          productTitle: product?.title,
          productItemId: product?.itemId,
          selectedArchId,
          workshopMode,
          assetLibraryTab:
            currentView === 'workshop' && activeWorkshopTab === 'prompt_assets'
              ? 'full_prompt'
              : undefined,
          workspaceSnapshot: getWorkspaceSnapshot?.(),
        },
        sessionApprovals: sessionApprovalsRef.current,
        signal: abortCtrl.signal,
        showToast,
        onUpdate: (patch: any) => {
          if (patch.pendingApprovals) setLivePendingApprovals(patch.pendingApprovals);
          if (patch.sessionApprovals) sessionApprovalsRef.current = patch.sessionApprovals;
          const msgPatch: Partial<AssistantMessage> = { error: false, turnId: turnIdRef.current || undefined };
          if (patch.task !== undefined) msgPatch.task = patch.task;
          if (patch.content !== undefined) msgPatch.content = patch.content;
          if (patch.thinking !== undefined) msgPatch.thinking = patch.thinking;
          if (patch.toolActivity !== undefined) msgPatch.toolActivity = patch.toolActivity;
          if (patch.productWidget !== undefined) msgPatch.productWidget = patch.productWidget;
          if (patch.modelUsed !== undefined) msgPatch.modelUsed = patch.modelUsed;
          if (patch.streamingStatus !== undefined) msgPatch.streamingStatus = patch.streamingStatus;
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

      const promptChars = allMsgs.reduce((acc, m) => acc + (m.content?.length || 0), 0);
      const replyChars = accumulated.length;
      const estPromptTokens = Math.max(50, Math.round(promptChars / 2.5));
      const estCompletionTokens = Math.max(30, Math.round(replyChars / 2.5));
      const usedModelId = modelUsed;
      const provider = resolveModelVendor(usedModelId);

      if (usedModelId !== 'direct-collection') recordModelUsage({
        modelId: usedModelId,
        modelName: usedModelId,
        provider,
        type: 'chat',
        promptTokens: estPromptTokens,
        completionTokens: estCompletionTokens,
        totalTokens: estPromptTokens + estCompletionTokens,
        success: true,
      });

      useAppStore.getState().persistAssistantNow();
    } catch (err: any) {
      streamUpdates.flush();
      if (err.name === 'AbortError') {
        updateAssistantMessage(sessionId, assistantMsgId, {
          content:
            (useAppStore
              .getState()
              .assistantSessions.find((s) => s.id === sessionId)
              ?.messages.find((m) => m.id === assistantMsgId)?.content || '') +
            '\n\n⏹ *用户已停止生成*',
        });
      } else {
        const partial = useAppStore.getState().assistantSessions.find((s) => s.id === sessionId)
          ?.messages.find((m) => m.id === assistantMsgId)?.content || '';
        updateAssistantMessage(sessionId, assistantMsgId, {
          content: partial,
          turnId: turnIdRef.current || undefined,
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
