import { RotateCcw } from 'lucide-react';
import { useAppStore, type AssistantMessage, type MediaAttachment } from '@client/store';
import AssistantTurnList from './AssistantTurnList';
import { AssistantReplyFooter } from './AssistantReplyFooter';
import { canRetryAssistantMessage, getAssistantMessageText } from './assistantMessagePresentation';
import { getAssistantProductIdeaPrompt } from '../../model/assistantSuggestions';
import type { PendingApproval, ApprovalDecision } from '../../model/assistantTurnTypes';

/**
 * CodexAssistantBubble — assistant 消息的 item-based 渲染壳。
 *
 * 旧 AssistantMessageList 仍负责头像、商品挂件、操作栏与气泡的"用户视角"层；
 * AssistantTurnList 负责把 items[] 渲染为多段 agentMessage / 工具时间线 / 思考 / 审批。
 */
export default function CodexAssistantBubble({
  onAnalyzeImages,
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
  setProductData,
  setStep,
  setCurrentView,
  setIsAssistantOpen,
  setChatPreview,
  showToast,
}: {
  onAnalyzeImages?: () => void;
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
  setProductData: (...args: any[]) => void;
  setStep: (step: number) => void;
  setCurrentView: (view: any) => void;
  setIsAssistantOpen: (v: boolean) => void;
  setChatPreview: (v: { url: string; type: 'image' | 'video'; poster?: string } | null) => void;
  resolveAssistantMediaSrc: (rawUrl?: string | null, asVideo?: boolean) => string;
  showToast: (msg: string) => void;
}) {
  const replyText = getAssistantMessageText(msg);
  // 把当前会话中的 approvalRequest 通过 legacy pendingApprovals 注入（覆盖）
  const approvalOverrides = msg.items?.filter(
    (it) => it.kind === 'approvalRequest' && it.status === 'pending',
  );
  const livePending = livePendingApprovals.length > 0
    ? livePendingApprovals
    : (approvalOverrides || []).map((ap: any) => ({
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
          onLoadToStudio={(prod, imgs) => {
            setProductData(prod, imgs, '🤖 AI 助手智能抓取导入');
            const store = useAppStore.getState();
            store.setWorkshopMode('storyboard_generate');
            store.setActiveWorkshopTab('studio');
            setStep(2);
            setCurrentView('workshop');
            setIsAssistantOpen(false);
            showToast('🚀 已载入生图工坊！');
          }}
          onAnalyzeImages={onAnalyzeImages}
          onGenerateShotsForProduct={(title) =>
            handleSendMessage(getAssistantProductIdeaPrompt(title))
          }
          onPreviewImage={(imgUrl) => setChatPreview({ url: imgUrl, type: 'image' })}
        />
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
