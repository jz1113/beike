import type { AppState } from '@client/store';
import { getAssistantProductIdeaPrompt, getReplyReferenceMedia } from '../../model/assistantConstants';
import { AssistantSkillIcon } from '@client/shared/icons/assistant/AssistantIcons';
import { useAssistantAutoScroll } from '../../hooks/useAssistantAutoScroll';
import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { ArrowRight, Eye, FileText, Images, Link, Play, RefreshCw, RotateCcw, ScanLine, Shield, WandSparkles } from 'lucide-react';
import { AssistantMessage, MediaAttachment, useAppStore } from '@client/store';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { normalizeImageUrlToStandardJpg } from '@shared/domain/media/drawing';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { ApprovalCard, FormattedMarkdown } from './AssistantTurnList';
import ProductCardWidget from '@client/shared/agent/ProductCardWidget';
import CodexAssistantBubble, {
  AssistantImageBatch,
  AssistantReplyFooter,
  canRetryAssistantMessage,
} from './CodexAssistantBubble';
import type { PendingApproval, ApprovalDecision, ToolActivityEntry } from '@client/features/assistant/model/assistantTurnTypes';
import type { AssistantTaskState } from '@shared/domain/assistant/taskPolicy';
import AssistantExecution, { AssistantMark } from './AssistantExecution';

function AssistantApprovalNotice({ count, onView }: { count: number; onView: () => void }) {
  if (!count) return null;
  return <div role="status" className="agent-approval-notice">
    <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span className="flex-1">有 {count} 项操作等待确认</span>
    <button type="button" onClick={onView} className="rounded underline underline-offset-2">查看待确认操作</button>
  </div>;
}

function AssistantLiveStatus({ message }: { message?: string }) {
  return <AssistantExecution isSending message={message} />;
}

interface AssistantWelcomeProps {
  onUpload: () => void;
  onPrompt: (prompt: string) => void;
}

function AssistantWelcome({ onUpload, onPrompt }: AssistantWelcomeProps) {
  const [page, setPage] = useState(0);
  const cards = [
    {
      id: 'reference',
      category: '参考图创作',
      title: '让一张图，开启新灵感',
      description: '上传参考图，一起探索画面与风格。',
      Icon: Images,
      tone: 'sage',
      action: onUpload,
    },
    {
      id: 'idea',
      category: '头脑风暴',
      title: '把想法，变成创作方案',
      description: '从主题到分镜，梳理你的创作方向。',
      Icon: WandSparkles,
      tone: 'sand',
      action: () => onPrompt('我有一个创作想法，请先帮我梳理主题、风格和制作步骤。'),
    },
    {
      id: 'link',
      category: '灵感采集',
      title: '从一个链接，发现灵感',
      description: '收集参考素材，整理值得借鉴的细节。',
      Icon: Link,
      tone: 'sage',
      action: () => onPrompt('请采集这个链接中的素材：'),
    },
    {
      id: 'prompt',
      category: '画面构思',
      title: '把一句话，写成画面',
      description: '细化主体、构图与光影，打磨提示词。',
      Icon: ScanLine,
      tone: 'sand',
      action: () => onPrompt('请帮我把下面的想法整理成图片生成提示词，细化主体、构图、风格与光影：'),
    },
  ];
  return (
    <div className="agent-welcome">
      <div className="agent-welcome-intro">
        <div className="agent-welcome-brand">
          <span className="agent-welcome-mark">
            <AssistantMark />
          </span>
          <span>你好，我是贝壳</span>
        </div>
        <h2>今天，一起创作点什么？</h2>
      </div>
      <div className="agent-start-cards" aria-label="开始创作">
        {cards.slice(page * 2, page * 2 + 2).map(({ id, category, title, description, Icon, tone, action }) => (
          <button type="button" className="agent-start-card" data-tone={tone} key={id} onClick={action}>
            <span className="agent-start-category">
              <Icon size={15} />
              <span>{category}</span>
              <ArrowRight className="agent-start-arrow" size={16} />
            </span>
            <strong>{title}</strong>
            <span className="agent-start-description">{description}</span>
          </button>
        ))}
      </div>
      <div className="agent-welcome-bottom">
        <button
          type="button"
          onClick={() => setPage((current) => (current + 1) % 2)}
          aria-label="换一组创作建议"
          title="换一组创作建议"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  );
}

interface TurnTimelineProps {
  toolActivity: ToolActivityEntry[];
  thinking?: string;
  task?: AssistantTaskState;
  startedAt?: number;
  streamingStatus?: string;
  hasReply?: boolean;
  pendingApprovals: PendingApproval[];
  onApprovalDecision: (approvalId: string, decision: ApprovalDecision) => void;
  isSending?: boolean;
}

function TurnTimeline({
  toolActivity,
  thinking,
  task,
  startedAt,
  streamingStatus,
  hasReply,
  pendingApprovals,
  onApprovalDecision,
  isSending,
}: TurnTimelineProps) {
  return (
    <div className="agent-turn-content">
      <AssistantExecution
        legacy={toolActivity}
        thinking={thinking}
        task={task}
        startedAt={startedAt}
        message={streamingStatus}
        isSending={isSending}
        active={Boolean(isSending && (!hasReply || toolActivity.some((item) => item.status === 'running')))}
        awaitingApproval={Boolean(isSending && pendingApprovals.length > 0)}
      />
      {pendingApprovals.map((approval) => (
        <ApprovalCard
          key={approval.approvalId}
          approval={approval}
          onDecision={(decision) => onApprovalDecision(approval.approvalId, decision)}
          disabled={!isSending}
        />
      ))}
    </div>
  );
}

/** Presentation-only deduplication: keep original messages and reference numbering intact. */
function duplicateCollectionCards(messages: AssistantMessage[]): Set<string> {
  const seen = new Set<string>();
  const hidden = new Set<string>();
  for (const message of messages) {
    const widget = message.productWidget;
    if (!widget || !['social', 'xiaohongshu', 'douyin', 'kuaishou', 'weibo'].includes(widget.platform)) continue;
    const images = [...new Set((widget.allImages || []).filter(Boolean))].sort();
    if (!images.length) continue;
    const key = JSON.stringify([widget.platform, images]);
    if (seen.has(key)) hidden.add(message.id);
    else seen.add(key);
  }
  return hidden;
}

export interface AssistantMessageListProps {
  onUpload: () => void;
  isOpen?: boolean;
  sessionId?: string;
  messages: AssistantMessage[];
  isExpanded?: boolean;
  activeSuggestionChips: string[];
  currentSessionMessages: AssistantMessage[];
  isSendingCurrent: boolean;
  sendingSessionId: string | null;
  streamingAssistantMsgId?: string | null;
  livePendingApprovals?: PendingApproval[];
  onApprovalDecision?: (approvalId: string, decision: ApprovalDecision) => void;
  copiedMsgId: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setInputContent: (v: string) => void;
  resolveAssistantMediaSrc: (rawUrl?: string | null, asVideo?: boolean) => string;
  handleSendMessage: (overrideContent?: string, options?: { retryAssistantId?: string }) => void;
  handleStopGeneration: () => void;
  handleCopyText: (content: string, id: string) => void;
  showToast: (msg: string) => void;
  setChatPreview: (v: { url: string; type: 'image' | 'video'; poster?: string } | null) => void;
  addAssistantAttachment: (att: MediaAttachment) => void;
  setProductData: AppState['setProductData'];
  setCurrentView: AppState['setCurrentView'];
  setIsAssistantOpen: (v: boolean) => void;
}

export default function AssistantMessageList({
  resolveAssistantMediaSrc,
  isOpen = true,
  sessionId = 'default',
  messages,
  onUpload,
  currentSessionMessages,
  isSendingCurrent,
  sendingSessionId,
  streamingAssistantMsgId,
  livePendingApprovals = [],
  onApprovalDecision,
  copiedMsgId,
  messagesEndRef,
  textareaRef,
  setInputContent,
  handleSendMessage,
  handleCopyText,
  showToast,
  setChatPreview,
  addAssistantAttachment,
  setProductData,
  setCurrentView,
  setIsAssistantOpen,
}: AssistantMessageListProps) {
  const { scrollRef, onScroll, releaseFollow } = useAssistantAutoScroll(isOpen, sessionId, messages);
  const [messageWindow, setMessageWindow] = useState(80);
  const historyAnchor = useRef<{ sessionId: string; height: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const anchor = historyAnchor.current;
    historyAnchor.current = null;
    const list = scrollRef.current;
    if (anchor?.sessionId === sessionId && list) {
      list.scrollTop = anchor.top + list.scrollHeight - anchor.height;
    }
  }, [messageWindow, sessionId, scrollRef]);
  const displayMessages = useMemo(() => {
    if (messages.length <= messageWindow) return messages;
    return messages.slice(-messageWindow);
  }, [messages, messageWindow]);
  const hiddenMessageCount = Math.max(0, messages.length - displayMessages.length);

  const hiddenCollectionCards = useMemo(() => duplicateCollectionCards(currentSessionMessages), [currentSessionMessages]);
  return (
    <>
      {/* 🌟 消息流与空状态主区域 */}
      <div ref={scrollRef} onScroll={onScroll} data-empty={messages.length === 0} className="agent-messages flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 min-h-0 scrollbar-thin">
        {messages.length === 0 ? (
          <AssistantWelcome
            key={sessionId}
            onUpload={onUpload}
            onPrompt={(prompt) => {
              const draft = useAppStore.getState().assistantInputDraft;
              setInputContent(draft.trim() ? `${draft.trimEnd()}\n\n${prompt}` : prompt);
              textareaRef.current?.focus();
            }}
          />
        ) : (
            /* 消息列表 */
            <>
            {hiddenMessageCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  releaseFollow();
                  const list = scrollRef.current;
                  if (list) {
                    historyAnchor.current = { sessionId, height: list.scrollHeight, top: list.scrollTop };
                  }
                  setMessageWindow((n) => n + 40);
                }}
                className="w-full py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer dark:text-slate-400 dark:hover:bg-white/10"
              >
                显示更早的 {hiddenMessageCount} 条消息
              </button>
            )}
            {displayMessages.map((msg) => {
            const isUser = msg.role === 'user';
            // A collection is an entry point, not an instruction to restart after every reply.
            const messageIndex = currentSessionMessages.findIndex((item) => item.id === msg.id);
            const hasFollowup = currentSessionMessages.slice(messageIndex + 1).some((item) => item.role === 'user');
            const canAnalyzeCollection = msg.modelUsed === 'direct-collection' && !hasFollowup;
            const referenceMedia = getReplyReferenceMedia(currentSessionMessages, msg.id);
            // ── Codex-style 渲染：若 assistant 消息携带 items[]，直接交给 AssistantTurnList
            if (!isUser && msg.items && msg.items.length > 0) {
              return (
                <CodexAssistantBubble
                  key={msg.id}
                  sessionId={sessionId}
                  msg={hiddenCollectionCards.has(msg.id) ? { ...msg, productWidget: undefined } : msg}
                  onAnalyzeImages={
                    canAnalyzeCollection
                      ? () => {
                          setInputContent('请分析刚才采集的图片，按我们讨论的用途挑选合适素材，标明素材编号、来源和理由。');
                          textareaRef.current?.focus();
                        }
                      : undefined
                  }
                  referenceMedia={referenceMedia}
                  isSendingCurrent={isSendingCurrent && streamingAssistantMsgId === msg.id}
                  livePendingApprovals={streamingAssistantMsgId === msg.id ? livePendingApprovals : []}
                  onApprovalDecision={onApprovalDecision}
                  handleSendMessage={handleSendMessage}
                  sendingSessionId={sendingSessionId}
                  handleCopyText={handleCopyText}
                  copiedMsgId={copiedMsgId}
                  addAssistantAttachment={addAssistantAttachment}
                  setProductData={setProductData}
                  setCurrentView={setCurrentView}
                  setIsAssistantOpen={setIsAssistantOpen}
                  setChatPreview={setChatPreview}
                  resolveAssistantMediaSrc={resolveAssistantMediaSrc}
                  showToast={showToast}
                />
              );
            }
            return (
              <div
                key={msg.id}
                className={`agent-message flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-fade-in group`}
              >
                <div className={`min-w-0 space-y-2 flex flex-col ${isUser ? 'agent-message-user max-w-[88%] items-end ml-auto' : 'w-full items-start'}`}>
                  {/* 智能体工具调用状态条 */}
                  {!isUser && (msg.task || msg.thinking || (msg.toolActivity && msg.toolActivity.length > 0) || (isSendingCurrent && streamingAssistantMsgId === msg.id)) && (
                    <TurnTimeline
                      task={msg.task}
                      startedAt={msg.timestamp}
                      streamingStatus={msg.streamingStatus}
                      hasReply={Boolean(msg.content)}
                      thinking={msg.thinking}
                      toolActivity={msg.toolActivity || []}
                      pendingApprovals={streamingAssistantMsgId === msg.id ? livePendingApprovals : []}
                      onApprovalDecision={(id, d) => onApprovalDecision?.(id, d)}
                      isSending={isSendingCurrent && streamingAssistantMsgId === msg.id}
                    />
                  )}

                  {/* 附件展示 (图片或视频 - 单行水平排列 + 智能角标) */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className={`flex items-center gap-2 my-1 overflow-x-auto max-w-full pb-0.5 scrollbar-none ${
                      isUser ? 'ml-auto justify-end' : 'mr-auto justify-start'
                    }`}>
                      {msg.attachments.map((att, attIdx) => (
                        <div 
                          key={attIdx} 
                          onClick={() => {
                            if (att.type === 'document') {
                              const preview = (att.extractedText || '').slice(0, 800);
                              showToast(preview ? `📄 ${att.name || '文档'}: ${preview}${(att.extractedText || '').length > 800 ? '…' : ''}` : `📄 ${att.name || '文档'}`);
                              return;
                            }
                            if (att.type === 'video' && att.url) {
                              setChatPreview({
                                url: att.url,
                                type: 'video',
                                poster: att.thumbnailUrl,
                              });
                              return;
                            }
                            const imgUrl = att.url || att.thumbnailUrl;
                            if (imgUrl) setChatPreview({ url: imgUrl, type: 'image' });
                          }}
                          className="relative w-20 h-20 sm:w-22 sm:h-22 rounded-xl overflow-hidden border border-slate-200/90 shadow-2xs aspect-square bg-slate-100 group/att cursor-pointer hover:border-red-500 transition-all hover:scale-102 flex-shrink-0 dark:bg-white/10 dark:border-white/10"
                          title={att.type === 'document' ? (att.name || '文档') : att.type === 'video' ? '点击播放视频' : `点击放大查看 @图片${msg.attachments!.slice(0, attIdx + 1).filter((item) => item.type !== 'document').length}`}
                        >
                          {att.type === 'document' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-slate-50 px-1 dark:bg-white/5">
                              <FileText className="w-6 h-6 text-indigo-600" />
                              <span className="text-[9px] text-slate-600 font-medium truncate max-w-full px-0.5 dark:text-slate-300">{att.name || '文档'}</span>
                            </div>
                          ) : att.type === 'video' ? (
                            <div className="relative w-full h-full bg-slate-900">
                              {att.thumbnailUrl && !isVideoMediaUrl(att.thumbnailUrl) ? (
                                <img
                                  src={resolveAssistantMediaSrc(att.thumbnailUrl, false)}
                                  alt="视频"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    if (!target.dataset.hasRetried && att.thumbnailUrl) {
                                      target.dataset.hasRetried = 'true';
                                      target.src = proxyMediaUrl(att.thumbnailUrl);
                                    }
                                  }}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <video
                                  src={resolveAssistantMediaSrc(att.url, true)}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="w-full h-full object-cover pointer-events-none"
                                />
                              )}
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <Play className="w-4 h-4 text-white fill-white" />
                              </div>
                            </div>
                          ) : (
                            <img 
                              src={att.url?.startsWith('data:') || att.url?.startsWith('blob:') ? att.url : (normalizeImageUrlToStandardJpg(att.url) || att.url)} 
                              alt={`图片${msg.attachments!.slice(0, attIdx + 1).filter((item) => item.type !== 'document').length}`} 
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (!target.dataset.hasRetried && att.url && !att.url.startsWith('data:') && !att.url.startsWith('blob:')) {
                                  target.dataset.hasRetried = 'true';
                                  target.src = proxyMediaUrl(att.url);
                                }
                              }}
                              className="w-full h-full object-cover" 
                            />
                          )}

                          <span className="absolute top-1 left-1 px-1.5 py-0.2 rounded-md bg-black/75 backdrop-blur-xs text-[10px] font-mono font-bold text-white z-10 shadow-xs">
                            {att.type === 'document' ? '文' : att.type === 'video' ? '视频' : `@图片${msg.attachments!.slice(0, attIdx + 1).filter((item) => item.type !== 'document').length}`}
                          </span>

                          {att.type !== 'document' && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center text-white z-20">
                              <Eye className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 文字内容气泡（普通 Markdown，代码块可一键复制） */}
                  {msg.content && (
                    <div className={`text-[13px] leading-7 select-text text-left ${
                      isUser
                        ? 'px-4 py-3 rounded-2xl bg-zinc-200/60 text-zinc-800 font-normal break-words'
                        : 'py-1 text-zinc-800 font-normal w-full'
                    }`}>
                      {isUser ? (
                        <div className="whitespace-pre-wrap break-all leading-relaxed">
                          {msg.usedSkill && (
                            <span title={`本条消息使用技能：${msg.usedSkill.name}`} className="mr-1.5 inline-flex max-w-full items-center gap-1 rounded-md border border-slate-300/70 bg-white/70 px-1.5 py-0.5 align-middle text-xs leading-4 text-slate-700 dark:text-slate-200 dark:bg-[#18191c]/95">
                              <AssistantSkillIcon className="h-3 w-3 shrink-0 text-amber-500" />
                              <span className="truncate">{msg.usedSkill.name}</span>
                            </span>
                          )}
                          {msg.content}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <FormattedMarkdown content={msg.content} referenceMedia={referenceMedia} accentColor="slate" />
                          <AssistantImageBatch sessionId={sessionId} replyId={msg.id} disabled={isSendingCurrent && streamingAssistantMsgId === msg.id} />
                          {isSendingCurrent && streamingAssistantMsgId === msg.id && (
                            <span className="inline-block w-1.5 h-3.5 bg-zinc-500 animate-pulse ml-1 align-middle rounded-xs" />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 🌟 智能体工具组件：电商抓取与素材交互选择卡片 */}
                  {msg.error && msg.interruptionReason && <p role="alert" className="text-sm text-amber-700">{msg.interruptionReason}</p>}
                  {msg.productWidget && !hiddenCollectionCards.has(msg.id) && (
                    <ProductCardWidget
                      product={msg.productWidget}
                      onSetAsReference={(imgUrl) => {
                        addAssistantAttachment({
                          type: 'image',
                          url: imgUrl,
                          name: `商品实物图_${Date.now()}.jpg`
                        });
                        showToast('已将图片加入待发送附件，发送前可预览或移除');
                      }}
                      onAnalyzeImages={
                        canAnalyzeCollection
                          ? () => {
                              setInputContent('请分析刚才采集的图片，按我们讨论的用途挑选合适素材，标明素材编号、来源和理由。');
                              textareaRef.current?.focus();
                            }
                          : undefined
                      }
                      onGenerateShotsForProduct={(title) => {
                        handleSendMessage(getAssistantProductIdeaPrompt(title));
                      }}
                      onPreviewImage={(imgUrl) => {
                        setChatPreview({ url: imgUrl, type: 'image' });
                      }}
                    />
                  )}

                  {/* 底部微小操作栏 (复制、重新执行、模型标签) */}
                  {!isUser && !(isSendingCurrent && streamingAssistantMsgId === msg.id) && (msg.content || msg.error) && (
                    <AssistantReplyFooter
                      canCopy={Boolean(msg.content?.trim())}
                      model={msg.modelUsed}
                      timestamp={msg.timestamp}
                      copied={copiedMsgId === msg.id}
                      onCopy={() => handleCopyText(msg.content, msg.id)}
                    >
                      {canRetryAssistantMessage(msg) && (
                        <button
                          type="button"
                          disabled={Boolean(sendingSessionId)}
                          onClick={() => handleSendMessage(undefined, { retryAssistantId: msg.id })}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" />
                          继续重试
                        </button>
                      )}
                    </AssistantReplyFooter>
                  )}
                </div>
              </div>
            );
          })}
            </>
        )}

        {/* 兜底：若发送中但消息列表中尚未包含助理消息（初始瞬间） */}
        {isSendingCurrent && !displayMessages.some((m) => m.role === 'assistant' && (m.id === streamingAssistantMsgId || !m.content)) && (
          <AssistantLiveStatus />
        )}

        <div ref={messagesEndRef} />
      </div>
      <AssistantApprovalNotice
        count={isSendingCurrent ? livePendingApprovals.length : 0}
        onView={() => {
          const card = scrollRef.current?.querySelector<HTMLElement>('[data-pending-approval]');
          card?.scrollIntoView({ block: 'center' });
          card?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
        }}
      />
    </>
  );
}
