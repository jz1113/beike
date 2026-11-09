import type { ReactNode } from 'react';
import type { ApprovalRequestItem } from '@shared/domain/assistant/types';
import { useAppStore, type AppState, type AssistantMessage, type MediaAttachment } from '@client/store';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { getModelIcon } from '@client/shared/ui/ModelIcons';
import GenerationBatchPanel from '@client/shared/agent/GenerationBatchPanel';
import { assistantPromptSource } from '@client/shared/agent/generationBatchSources';
import AssistantTurnList from './AssistantTurnList';
import { getAssistantProductIdeaPrompt } from '../../model/assistantConstants';
import type { PendingApproval, ApprovalDecision } from '../../model/assistantTurnTypes';

/** Match the text actually displayed by the item renderer, including multiple reply segments. */
export function getAssistantMessageText(message: AssistantMessage): string {
  if (message.role === 'assistant') {
    const replies = message.items?.flatMap((item) => (item.kind === 'agentMessage' && item.content.trim() ? [item.content] : []));
    if (replies?.length) return replies.join('\n\n');
  }
  return message.content || '';
}

export function canRetryAssistantMessage(message: AssistantMessage): boolean {
  return Boolean(
    message.error ||
      message.task?.status === 'failed' ||
      message.task?.status === 'cancelled' ||
      message.content.startsWith('⚠️ 请求失败') ||
      // Old cached conversations have only this terminal marker; prose mentioning the status is not a failure.
      /⏹\s*\*?用户已停止生成\*?\s*$/.test(message.content),
  );
}

/** Stable message identity replaces the old body-text lookup. */
export function AssistantImageBatch({
  sessionId,
  replyId,
  disabled = false,
}: {
  sessionId: string;
  replyId: string;
  disabled?: boolean;
}) {
  const session = useAppStore((state) => state.assistantSessions.find((item) => item.id === sessionId));
  const message = session?.messages.find((item) => item.id === replyId);
  if (!session || !message) return null;
  const source = assistantPromptSource(session.messages, message, sessionId);
  return <GenerationBatchPanel key={source.sourceId} source={source} disabled={disabled || Boolean(message.error)} />;
}

export function AssistantReplyFooter({
  model,
  timestamp,
  copied,
  onCopy,
  canCopy = true,
  children,
}: {
  canCopy?: boolean;
  model?: string;
  timestamp: number;
  copied: boolean;
  onCopy: () => void;
  children?: ReactNode;
}) {
  const date = new Date(timestamp);
  const validTime = Number.isFinite(date.getTime());
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] leading-5 text-zinc-500">
      {model && (
        <span className="inline-flex min-w-0 max-w-full items-center gap-1.5" title={model}>
          {model !== 'direct-collection' && getModelIcon(model, 'h-3.5 w-3.5 shrink-0 opacity-80')}
          <span className="truncate">
            {model === 'direct-collection' ? '直接采集 · 未调用 AI' : model.replace('-preview-thinking-high', '').replace('-preview', '')}
          </span>
        </span>
      )}
      {canCopy && (
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? '已复制回答' : '复制回答'}
          title={copied ? '已复制' : '复制回答'}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
      {validTime && (
        <time dateTime={date.toISOString()} title={date.toLocaleString('zh-CN')} className="shrink-0 tabular-nums text-zinc-400">
          {date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
        </time>
      )}
      {children}
    </div>
  );
}

/**
 * CodexAssistantBubble — assistant 消息的 item-based 渲染壳。
 *
 * 旧 AssistantMessageList 仍负责头像、商品挂件、操作栏与气泡的"用户视角"层；
 * AssistantTurnList 负责把 items[] 渲染为多段 agentMessage / 工具时间线 / 思考 / 审批。
 */
export default function CodexAssistantBubble({
  onAnalyzeImages,
  sessionId,
  msg,
  referenceMedia,
  isSendingCurrent,
  livePendingApprovals,
  onApprovalDecision,
  handleSendMessage,
  sendingSessionId,
  handleCopyText,
  copiedMsgId,
  addAssistantAttachment,
  setChatPreview,
  showToast,
}: {
  onAnalyzeImages?: () => void;
  sessionId: string;
  msg: AssistantMessage;
  referenceMedia: MediaAttachment[];
  isSendingCurrent: boolean;
  livePendingApprovals: PendingApproval[];
  onApprovalDecision?: (approvalId: string, decision: ApprovalDecision) => void;
  handleSendMessage: (overrideContent?: string, options?: { retryAssistantId?: string }) => void;
  sendingSessionId: string | null;
  handleCopyText: (content: string, id: string) => void;
  copiedMsgId: string | null;
  addAssistantAttachment: (att: MediaAttachment) => void;
  setProductData: AppState['setProductData'];
  setCurrentView: AppState['setCurrentView'];
  setIsAssistantOpen: (v: boolean) => void;
  setChatPreview: (v: { url: string; type: 'image' | 'video'; poster?: string } | null) => void;
  resolveAssistantMediaSrc: (rawUrl?: string | null, asVideo?: boolean) => string;
  showToast: (msg: string) => void;
}) {
  const replyText = getAssistantMessageText(msg);
  // 把当前会话中的 approvalRequest 通过 legacy pendingApprovals 注入（覆盖）
  const approvalOverrides = msg.items?.filter(
    (it): it is ApprovalRequestItem => it.kind === 'approvalRequest' && it.status === 'pending',
  );
  const livePending = livePendingApprovals.length > 0
    ? livePendingApprovals
    : (approvalOverrides || []).map((ap) => ({
        turnId: msg.turnId || '',
        approvalId: ap.approvalId,
        toolName: ap.toolName,
        displayName: ap.displayName,
        args: ap.args || {},
      }));

  return (
    <div className="agent-message flex items-start gap-3 flex-row animate-fade-in group">
      <div className="w-full min-w-0 space-y-2 flex flex-col items-start">
        {msg.error && msg.interruptionReason && <p role="alert" className="text-sm text-amber-700">{msg.interruptionReason}</p>}
        <AssistantTurnList
          items={msg.items || []}
          task={msg.task}
          startedAt={msg.timestamp}
          livePendingApprovals={livePending}
          referenceMedia={referenceMedia}
          streamingStatus={msg.streamingStatus}
          isSending={isSendingCurrent}
          modelUsed={msg.modelUsed}
          productWidget={msg.productWidget}
          onApprovalDecision={(id, d) => onApprovalDecision?.(id, d)}
          onSetAsReference={(imgUrl) => {
            addAssistantAttachment({
              type: 'image',
              url: imgUrl,
              name: `商品实物图_${Date.now()}.jpg`,
            });
            showToast('已将图片加入待发送附件，发送前可预览或移除');
          }}
          onAnalyzeImages={onAnalyzeImages}
          onGenerateShotsForProduct={(title) =>
            handleSendMessage(getAssistantProductIdeaPrompt(title))
          }
          onPreviewImage={(imgUrl) => setChatPreview({ url: imgUrl, type: 'image' })}
        />
        <AssistantImageBatch sessionId={sessionId} replyId={msg.id} disabled={isSendingCurrent} />
        {/* 底部操作栏：模型标签 + 复制 + 重新执行 */}
        {!isSendingCurrent && (replyText || msg.error || canRetryAssistantMessage(msg)) && <AssistantReplyFooter
                      canCopy={Boolean(replyText.trim())}
                      model={msg.modelUsed}
                      timestamp={msg.timestamp}
                      copied={copiedMsgId === msg.id}
                      onCopy={() => handleCopyText(replyText, msg.id)}
                    >
                      {canRetryAssistantMessage(msg) && (
                        <button type="button" disabled={Boolean(sendingSessionId)}
                          onClick={() => handleSendMessage(undefined, { retryAssistantId: msg.id })}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                          <RotateCcw className="h-3 w-3" />继续重试
                        </button>
                      )}
                    </AssistantReplyFooter>}

      </div>
    </div>
  );
}
