import AssistantTaskCard from './AssistantTaskCard';
import AssistantLiveStatus from './AssistantLiveStatus';
import { duplicateCollectionCards } from '../utils/collectionCardVisibility';
import { AssistantSkillIcon } from './AssistantSkillIcon';
import { useAssistantAutoScroll } from '../hooks/useAssistantAutoScroll';
import { AssistantReplyFooter } from './AssistantReplyFooter';
import React, { useState, useMemo } from 'react';
import { Eye, FileText, Loader2, Paperclip, Play, RotateCcw } from 'lucide-react';
import { AssistantMessage, MediaAttachment, useAppStore } from '@/store';
import { proxyMediaUrl } from '@/shared/api/apiClient';
import { normalizeImageUrlToStandardJpg } from '@beike/domain/drawing';
import { isVideoMediaUrl } from '@/shared/media/mediaHelper';
import FormattedMarkdown from '@/features/assistant/components/FormattedMarkdown';
import { getReplyReferenceMedia } from '../utils/assistantPromptReferences';
import ProductCardWidget from '@/features/assistant/components/ProductCardWidget';
import TurnTimeline from '@/features/assistant/components/TurnTimeline';
import AssistantTurnList from '@/features/assistant/components/AssistantTurnList';
import AssistantOperationHistory from '@/features/assistant/components/AssistantOperationHistory';
import type { PendingApproval, ApprovalDecision } from '@/features/assistant/utils/assistantTurnTypes';

export interface AssistantMessageListProps {
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
  setProductData: (...args: any[]) => void;
  setStep: (step: number) => void;
  setCurrentView: (view: any) => void;
  setIsAssistantOpen: (v: boolean) => void;
}

export default function AssistantMessageList({
  resolveAssistantMediaSrc,
  isOpen = true,
  sessionId = 'default',
  messages,
  isExpanded = false,
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
  setStep,
  setCurrentView,
  setIsAssistantOpen,
}: AssistantMessageListProps) {
  const { scrollRef, onScroll } = useAssistantAutoScroll(isOpen, sessionId, messages);
  const [messageWindow, setMessageWindow] = useState(80);
  const displayMessages = useMemo(() => {
    if (messages.length <= messageWindow) return messages;
    return messages.slice(-messageWindow);
  }, [messages, messageWindow]);
  const hiddenMessageCount = Math.max(0, messages.length - displayMessages.length);

  const uploadInputRef = React.useRef<HTMLInputElement>(null);

  // 处理从空状态卡片上传参考图
  const handleEmptyStateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl && addAssistantAttachment) {
          addAssistantAttachment({
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'image',
            url: dataUrl,
            name: file.name,
            size: file.size,
          });
        }
      };
      reader.readAsDataURL(file);
    });
    textareaRef.current?.focus();
    showToast?.(`已添加 ${files.length} 张参考图，输入需求即可开始创作`);
  };

  const hiddenCollectionCards = useMemo(() => duplicateCollectionCards(currentSessionMessages), [currentSessionMessages]);
  return (
    <>
      {/* 隐藏的文件上传 input 用于空状态「上传参考图」 */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleEmptyStateUpload}
      />

      {/* 🌟 消息流与空状态主区域 */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 min-h-0 scrollbar-thin">
        {messages.length === 0 ? (
          /* 🌟 空状态引导页 (精准还原图2：居中大标题 + 从已有素材开始/上传参考图 + 灵感引导 + 手绘指示箭头) */
          <div className={`h-full min-h-[380px] flex flex-col justify-center items-center py-6 sm:py-10 mx-auto w-full animate-fade-in select-none transition-all duration-300 ${
            isExpanded 
              ? 'max-w-2xl sm:max-w-3xl px-4 sm:px-8' 
              : 'max-w-md px-4'
          }`}>
            {/* 居中主标题（对应图2：「和Agent聊聊你的想法」） */}
            <div className="w-full text-center mb-9 sm:mb-12">
              <h2 className={`${isExpanded ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} font-bold text-slate-800 tracking-tight transition-all`}>
                和Agent聊聊你的想法
              </h2>
            </div>

            {/* 核心双路径选项容器 */}
            <div className={`w-full relative ${isExpanded ? 'max-w-[640px] grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-10 items-start' : 'max-w-[360px] space-y-8'}`}>
              
              {/* 路径 1：从已有素材开始 / 上传参考图 */}
              <div 
                onClick={() => uploadInputRef.current?.click()}
                className={`flex gap-4.5 group/item cursor-pointer ${isExpanded ? 'flex-col items-start' : 'items-center'}`}
              >
                {/* 左侧微立体倾斜双卡片插图 */}
                <div className={`${isExpanded ? 'w-20 h-20' : 'w-14 h-14'} shrink-0 flex items-center justify-center`}>
                  <img
                    src="/brand/canvas/start_cards.png"
                    alt="使用已有素材"
                    className="w-full h-full object-contain select-none pointer-events-none group-hover/item:scale-105 transition-transform duration-200"
                  />
                </div>

                {/* 右侧文字与交互动作 */}
                <div className="flex-1 min-w-0">
                  <div className={`${isExpanded ? 'text-base' : 'text-xs sm:text-sm'} font-normal text-slate-400 select-none`}>
                    从已有素材开始
                  </div>
                  <div className={`flex items-center gap-1.5 ${isExpanded ? 'text-lg mt-3' : 'text-sm sm:text-base mt-0.5'} font-semibold text-slate-800 group-hover/item:text-indigo-600 transition-colors`}>
                    <Paperclip className="w-4 h-4 text-slate-700 group-hover/item:text-indigo-600 transition-colors -rotate-45" />
                    <span>上传参考图</span>
                  </div>
                </div>
              </div>

              {/* 路径 2：没有好创意？先和Agent聊聊，或者搜一搜站内灵感吧！ */}
              <div className={`relative flex gap-4.5 group/agent ${isExpanded ? 'flex-col items-start' : 'items-center'}`}>
                {/* 与画布引导共用助手图标，透明无边框。 */}
                <div className={`${isExpanded ? 'w-20 h-20' : 'w-14 h-14'} bg-transparent flex items-center justify-center text-cyan-500 shrink-0 transition-transform duration-300 group-hover/agent:scale-105`}>
                  <AssistantSkillIcon className={`${isExpanded ? 'w-10 h-10' : 'w-7 h-7'} stroke-[1.9]`} />
                </div>

                {/* 右侧文案与交互操作 */}
                <div className={`flex-1 min-w-0 ${isExpanded ? '' : 'pr-6 sm:pr-8'}`}>
                  <p className={`${isExpanded ? 'text-base leading-8' : 'text-xs sm:text-sm leading-relaxed'} text-slate-500`}>
                    没有好创意？先
                    <button
                      type="button"
                      onClick={() => {
                        setInputContent('我想针对当前商品策划一套高点击率的爆款视觉与分镜方案，请根据当季流行风格帮我构思创意点');
                        textareaRef.current?.focus();
                      }}
                      className="text-teal-600 hover:text-teal-700 font-medium underline underline-offset-2 decoration-teal-300 hover:decoration-teal-600 cursor-pointer transition-colors mx-0.5"
                    >
                      和Agent聊聊
                    </button>
                    ，<br />
                    或者
                    <button
                      type="button"
                      onClick={() => setCurrentView('home')}
                      className="text-slate-600 hover:text-indigo-600 font-medium underline underline-offset-2 decoration-slate-300 hover:decoration-indigo-600 cursor-pointer transition-colors mx-0.5"
                    >
                      搜一搜站内灵感
                    </button>
                    吧！
                  </p>
                </div>

                {/* 右下方手绘风实线弯曲指示箭头（精准指向底部的输入框） */}
                <div className={`${isExpanded ? 'hidden' : 'absolute -right-2 sm:-right-4 top-10 sm:top-11 translate-x-2'} pointer-events-none select-none`}>
                  <svg
                    className="w-14 h-24 text-slate-400/80 stroke-current fill-none overflow-visible"
                    viewBox="0 0 60 100"
                  >
                    {/* 手绘实线优美贝塞尔曲线 */}
                    <path
                      d="M 10 5 C 45 15, 62 55, 30 92"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    {/* 弯曲指向箭头尖 */}
                    <path
                      d="M 22 84 L 30 92 L 38 88"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

            </div>
          </div>
        ) : (
            /* 消息列表 */
            <>
            {hiddenMessageCount > 0 && (
              <button
                type="button"
                onClick={() => setMessageWindow((n) => n + 40)}
                className="w-full py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
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
                  msg={hiddenCollectionCards.has(msg.id) ? { ...msg, productWidget: undefined } : msg}
                  onAnalyzeImages={canAnalyzeCollection ? () => { setInputContent('请分析刚才采集的图片，按我们讨论的用途挑选合适素材，标明素材编号、来源和理由。'); textareaRef.current?.focus(); } : undefined}
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
                  setStep={setStep}
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
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-fade-in group`}
              >
                <div className={`min-w-0 space-y-2 flex flex-col ${isUser ? 'max-w-[88%] items-end ml-auto' : 'w-full items-start'}`}>
                  {!isUser && msg.task && <AssistantTaskCard task={msg.task} />}
                  {/* 智能体工具调用状态条 */}
                  {!isUser && (msg.thinking || (msg.toolActivity && msg.toolActivity.length > 0) || (streamingAssistantMsgId === msg.id && livePendingApprovals.length > 0)) && (
                    <TurnTimeline
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
                          className="relative w-20 h-20 sm:w-22 sm:h-22 rounded-xl overflow-hidden border border-slate-200/90 shadow-2xs aspect-square bg-slate-100 group/att cursor-pointer hover:border-red-500 transition-all hover:scale-102 flex-shrink-0"
                          title={att.type === 'document' ? (att.name || '文档') : att.type === 'video' ? '点击播放视频' : `点击放大查看 @图片${msg.attachments!.slice(0, attIdx + 1).filter((item) => item.type !== 'document').length}`}
                        >
                          {att.type === 'document' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-slate-50 px-1">
                              <FileText className="w-6 h-6 text-indigo-600" />
                              <span className="text-[9px] text-slate-600 font-medium truncate max-w-full px-0.5">{att.name || '文档'}</span>
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

                  {/* 消息等待 / 正在思考连接状态（当尚无输出内容时） */}
                  {!isUser && isSendingCurrent && streamingAssistantMsgId === msg.id && !msg.content && !msg.thinking && (!msg.toolActivity || msg.toolActivity.length === 0) && (
                    <AssistantLiveStatus message={msg.streamingStatus} />
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
                            <span title={`本条消息使用技能：${msg.usedSkill.name}`} className="mr-1.5 inline-flex max-w-full items-center gap-1 rounded-md border border-slate-300/70 bg-white/70 px-1.5 py-0.5 align-middle text-xs leading-4 text-slate-700">
                              <AssistantSkillIcon className="h-3 w-3 shrink-0 text-amber-500" />
                              <span className="truncate">{msg.usedSkill.name}</span>
                            </span>
                          )}
                          {msg.content}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <FormattedMarkdown content={msg.content} referenceMedia={referenceMedia} accentColor="slate" />
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
                        showToast('📌 已将该图片设为当前生图垫图 (图1)！');
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
                      onAnalyzeImages={canAnalyzeCollection ? () => { setInputContent('请分析刚才采集的图片，按我们讨论的用途挑选合适素材，标明素材编号、来源和理由。'); textareaRef.current?.focus(); } : undefined}
          onGenerateShotsForProduct={(title) => {
                        handleSendMessage(`请针对【${title}】的真实外观、材质与核心卖点，构思 6 条极具商业转化力的高清实拍生图提示词，用 Markdown 标题 + 代码块给出，方便直接复制`);
                      }}
                      onPreviewImage={(imgUrl) => {
                        setChatPreview({ url: imgUrl, type: 'image' });
                      }}
                    />
                  )}

                  {/* 底部微小操作栏 (复制、重新执行、模型标签) */}
                  {!isUser && (
                    <AssistantReplyFooter
                      model={msg.modelUsed}
                      timestamp={msg.timestamp}
                      copied={copiedMsgId === msg.id}
                      onCopy={() => handleCopyText(msg.content, msg.id)}
                    >
                      {(msg.error || (msg.content || '').startsWith('⚠️ 请求失败') || msg.content?.includes('用户已停止')) && (
                        <button type="button" disabled={Boolean(sendingSessionId)}
                          onClick={() => handleSendMessage(undefined, { retryAssistantId: msg.id })}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                          <RotateCcw className="h-3 w-3" />{(msg.error || msg.content?.includes('用户已停止')) ? '继续重试' : '重新执行'}
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
          <div className="flex items-start gap-3 animate-fade-in">
            <div className="py-2 text-xs text-zinc-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400 shrink-0" />
              <span>正在读取当前工作区并准备回应...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </>
  );
}

/**
 * CodexAssistantBubble — assistant 消息的 item-based 渲染壳。
 *
 * 旧 AssistantMessageList 仍负责头像、商品挂件、操作栏与气泡的"用户视角"层；
 * AssistantTurnList 负责把 items[] 渲染为多段 agentMessage / 工具时间线 / 思考 / 审批。
 */
function CodexAssistantBubble({
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
    <div className="flex items-start gap-3 flex-row animate-fade-in group">
      <div className="w-full min-w-0 space-y-2 flex flex-col items-start">
        {msg.task && <AssistantTaskCard task={msg.task} />}
        {msg.error && msg.interruptionReason && <p role="alert" className="text-sm text-amber-700">{msg.interruptionReason}</p>}
        <AssistantTurnList
          items={msg.items || []}
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
            showToast('📌 已将该图片设为当前生图垫图 (图1)！');
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
            handleSendMessage(`请针对【${title}】的真实外观、材质与核心卖点，构思 6 条极具商业转化力的高清实拍生图提示词，用 Markdown 标题 + 代码块给出，方便直接复制`)
          }
          onPreviewImage={(imgUrl) => setChatPreview({ url: imgUrl, type: 'image' })}
        />
        <AssistantOperationHistory items={msg.items || []} />
        {/* 底部操作栏：模型标签 + 复制 + 重新执行 */}
        <AssistantReplyFooter
                      model={msg.modelUsed}
                      timestamp={msg.timestamp}
                      copied={copiedMsgId === msg.id}
                      onCopy={() => handleCopyText(msg.content, msg.id)}
                    >
                      {(msg.error || (msg.content || '').startsWith('⚠️ 请求失败') || msg.content?.includes('用户已停止')) && (
                        <button type="button" disabled={Boolean(sendingSessionId)}
                          onClick={() => handleSendMessage(undefined, { retryAssistantId: msg.id })}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                          <RotateCcw className="h-3 w-3" />{(msg.error || msg.content?.includes('用户已停止')) ? '继续重试' : '重新执行'}
                        </button>
                      )}
                    </AssistantReplyFooter>
        {/* Live approval indicator (carried over from legacy stream) */}
        {isSendingCurrent && livePending.length > 0 && (
          <div className="text-[10px] text-amber-700 italic">
            ⏳ 等待审批：{livePending.map((a) => a.displayName).join('、')}
          </div>
        )}
      </div>
    </div>
  );
}
