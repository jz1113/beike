'use client';

import {
  ArrowUp,
  Bot,
  Check,
  Copy,
  Eye,
  FileText,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
} from 'lucide-react';
import { AssistantMessage, MediaAttachment } from '@/store/useAppStore';
import { proxyMediaUrl } from '@/lib/apiClient';
import { normalizeImageUrlToStandardJpg } from '@/lib/drawing';
import { isVideoMediaUrl } from '@/lib/mediaHelper';
import type { AssistantSkill } from '@/lib/skills/ecommerce-visual-director';
import FormattedMarkdown from '@/features/assistant/FormattedMarkdown';
import ProductCardWidget from '@/features/assistant/ProductCardWidget';
import AssistantToolActivity from '@/features/assistant/AssistantToolActivity';
import type { ParsedShotItem } from '@/features/assistant/BatchPromptModal';
import { SUPPORTED_DOC_FORMATS } from '@/features/assistant/assistantConstants';

export interface AssistantMessageListProps {
  messages: AssistantMessage[];
  selectedSkill: AssistantSkill | null;
  activeSuggestionChips: string[];
  currentSessionMessages: AssistantMessage[];
  isSendingCurrent: boolean;
  sendingSessionId: string | null;
  copiedMsgId: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setInputContent: (v: string) => void;
  resolveAssistantMediaSrc: (rawUrl?: string | null, asVideo?: boolean) => string;
  extractShotsFromMessage: (content: string, attachments?: MediaAttachment[]) => ParsedShotItem[];
  handleSendMessage: (overrideContent?: string, options?: { retryAssistantId?: string }) => void;
  handleStopGeneration: () => void;
  handleCopyText: (content: string, id: string) => void;
  handleUseSinglePrompt: (promptText: string, aspectRatio?: string) => void;
  showToast: (msg: string) => void;
  setChatPreview: (v: { url: string; type: 'image' | 'video'; poster?: string } | null) => void;
  setActiveBatchShots: (shots: ParsedShotItem[]) => void;
  setIsBatchModalOpen: (v: boolean) => void;
  addAssistantAttachment: (att: MediaAttachment) => void;
  setProductData: (...args: any[]) => void;
  setStep: (step: number) => void;
  setCurrentView: (view: any) => void;
  setIsAssistantOpen: (v: boolean) => void;
}

export default function AssistantMessageList({
  messages,
  selectedSkill,
  activeSuggestionChips,
  currentSessionMessages,
  isSendingCurrent,
  sendingSessionId,
  copiedMsgId,
  messagesEndRef,
  textareaRef,
  setInputContent,
  resolveAssistantMediaSrc,
  extractShotsFromMessage,
  handleSendMessage,
  handleStopGeneration,
  handleCopyText,
  handleUseSinglePrompt,
  showToast,
  setChatPreview,
  setActiveBatchShots,
  setIsBatchModalOpen,
  addAssistantAttachment,
  setProductData,
  setStep,
  setCurrentView,
  setIsAssistantOpen,
}: AssistantMessageListProps) {
  return (
    <>

        {/* 🌟 2. 消息流与空状态主区域 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 min-h-0 scrollbar-thin">
          {messages.length === 0 ? (
            /* 🌟 空状态引导页 (智能自适应：支持根据已挂载 Skill 自动切换向导模式) */
            selectedSkill ? (
              <div className="h-full flex flex-col justify-center items-center text-center px-2 py-6 space-y-5 animate-fade-in my-auto">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-red-600 to-orange-500 text-white flex items-center justify-center mx-auto shadow-md">
                    <Bot className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center justify-center gap-1.5">
                    <span>{selectedSkill.name}</span>
                  </h2>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                    {selectedSkill.greeting || selectedSkill.description}
                  </p>
                </div>

                {/* 物料向导清单 */}
                {selectedSkill.inputRequirements && selectedSkill.inputRequirements.length > 0 && (
                  <div className="w-full max-w-sm rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 text-left space-y-2 shadow-2xs">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-red-500" />
                      <span>建议提供的创作物料</span>
                    </div>
                    <div className="space-y-1.5 text-xs text-slate-700 font-medium">
                      {selectedSkill.inputRequirements.map((req, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
                          <span>{req}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 快捷指令模板 */}
                {selectedSkill.quickTemplates && selectedSkill.quickTemplates.length > 0 && (
                  <div className="w-full max-w-sm space-y-2 text-left">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                      ⚡ 快捷指令模版 (点击一键填入)
                    </div>
                    <div className="space-y-1.5">
                      {selectedSkill.quickTemplates.map((tpl, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setInputContent(tpl.prompt);
                            textareaRef.current?.focus();
                          }}
                          className="w-full p-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-red-300 text-xs text-slate-800 transition-all text-left flex items-center justify-between cursor-pointer group shadow-2xs"
                        >
                          <span className="font-semibold">{tpl.label}</span>
                          <ArrowUp className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 flex-shrink-0 ml-2" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center items-center text-center px-4 py-8 space-y-6 animate-fade-in my-auto">
                {/* 沉浸式问候标语 */}
                <div className="space-y-3">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center justify-center gap-2">
                    <span className="text-red-600">告诉 AI 助手，</span>
                    <span>你想如何创作</span>
                  </h2>
                  <div className="text-xs sm:text-sm text-slate-600 space-y-1.5 text-left max-w-xs mx-auto font-medium">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span>输入灵感，让 AI 帮您展开</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span>上传图片/视频/文档作为参考</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                      <span className="text-slate-500 font-normal">文档支持 {SUPPORTED_DOC_FORMATS}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      <span>边聊边改，直到更接近你的想法</span>
                    </div>
                  </div>
                </div>

                {/* 快捷推荐气泡 */}
                <div className="w-full space-y-2 pt-2 text-left">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    💡 快速灵感试一试
                  </div>
                  <div className="space-y-1.5">
                    {activeSuggestionChips.map((chip: string, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(chip)}
                        className="w-full p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/90 border border-slate-200/80 hover:border-slate-300 text-xs text-slate-700 hover:text-slate-900 transition-all text-left flex items-center justify-between cursor-pointer group shadow-2xs"
                      >
                        <span className="truncate">{chip}</span>
                        <ArrowUp className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 flex-shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* 消息列表 */
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-fade-in group`}
                >
                  {/* 头像 */}
                  <div className={`w-8 h-8 rounded-xl p-1 flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-2xs ${
                    isUser 
                      ? 'bg-slate-900 text-white' 
                      : 'bg-gradient-to-b from-rose-50 to-white border border-rose-100/90'
                  }`}>
                    {isUser ? (
                      <span>我</span>
                    ) : (
                      <img 
                        src="/app_logo.png" 
                        alt="AI" 
                        draggable={false}
                        className="w-full h-full object-contain filter drop-shadow-2xs" 
                      />
                    )}
                  </div>

                  {/* 消息气泡 */}
                  <div className={`max-w-[88%] space-y-2 flex flex-col ${isUser ? 'items-end ml-auto' : 'items-start mr-auto'}`}>
                    {/* 智能体工具调用状态条 */}
                    {!isUser && msg.toolActivity && msg.toolActivity.length > 0 && (
                      <AssistantToolActivity items={msg.toolActivity} />
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
                            title={att.type === 'document' ? (att.name || '文档') : att.type === 'video' ? '点击播放视频' : `点击放大查看 图${attIdx + 1}`}
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
                                alt={`图${attIdx + 1}`} 
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
                              {att.type === 'document' ? '文' : att.type === 'video' ? '视频' : `图${attIdx + 1}`}
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

                    {/* 文字内容气泡 (深度 Markdown 美化排版) */}
                    {msg.content && (
                      <div className={`p-4 rounded-2xl text-xs sm:text-[13px] leading-relaxed shadow-2xs select-text text-left ${
                        isUser
                          ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-tr-xs font-normal break-all shadow-md shadow-indigo-500/10'
                          : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs font-normal w-full shadow-xs'
                      }`}>
                        {isUser ? (
                          <div className="whitespace-pre-wrap break-all leading-relaxed">
                            {msg.content}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <FormattedMarkdown 
                              content={msg.content} 
                              onUsePrompt={handleUseSinglePrompt}
                            />

                            {/* 智能检测：如果当前回复包含多个分镜生图提示词，呈现一键批量生图快捷条 */}
                            {(() => {
                              const allSessionAttachments = currentSessionMessages.flatMap(m => m.attachments || []);
                              const detectedShots = extractShotsFromMessage(msg.content, allSessionAttachments);
                              if (detectedShots.length > 0) {
                                return (
                                  <div className="mt-3 p-3 rounded-2xl bg-gradient-to-r from-red-50 via-orange-50 to-amber-50 border border-red-200 flex items-center justify-between gap-3 animate-fade-in shadow-2xs">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
                                        <Sparkles className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                                          <span>识别到 {detectedShots.length} 组分镜绘图提示词</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                          已自动绑定参考图与画幅比例
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setActiveBatchShots(detectedShots);
                                          setIsBatchModalOpen(true);
                                        }}
                                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white text-xs font-bold shadow-md shadow-red-500/20 flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                                      >
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>⚡ 批量生图工作台</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 🌟 智能体工具组件：电商抓取与素材交互选择卡片 */}
                    {msg.productWidget && (
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
                          setStep(2);
                          setCurrentView('buyer_show');
                          setIsAssistantOpen(false);
                          showToast('🚀 已载入生图工坊！');
                        }}
                        onGenerateShotsForProduct={(title) => {
                          handleSendMessage(`请针对【${title}】的真实外观、材质与核心卖点，构思 6 张极具商业转化力的高清实拍电商分镜`);
                        }}
                        onPreviewImage={(imgUrl) => {
                          setChatPreview({ url: imgUrl, type: 'image' });
                        }}
                      />
                    )}

                    {/* 底部微小操作栏 (复制、重新执行、模型标签) */}
                    {!isUser && (
                      <div className={`flex flex-wrap items-center gap-2 pt-0.5 text-[10px] text-slate-400 ${msg.error ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                        {msg.modelUsed && (
                          <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200/80">
                            {msg.modelUsed.replace('-preview-thinking-high', '').replace('-preview', '')}
                          </span>
                        )}
                        {(msg.error || (msg.content || '').startsWith('⚠️ 请求失败')) && (
                          <button
                            type="button"
                            disabled={Boolean(sendingSessionId)}
                            onClick={() => handleSendMessage(undefined, { retryAssistantId: msg.id })}
                            className="hover:text-indigo-700 text-indigo-600 flex items-center gap-0.5 transition-colors cursor-pointer font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>重新执行</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleCopyText(msg.content, msg.id)}
                          className="hover:text-slate-700 flex items-center gap-0.5 transition-colors cursor-pointer"
                        >
                          {copiedMsgId === msg.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedMsgId === msg.id ? '已复制' : '复制'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* 生成中 Loading 动效 + 停止生成按钮 */}
          {isSendingCurrent && (
            <div className="flex items-center gap-3 animate-fade-in">
              <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-red-500 shadow-2xs">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2 shadow-2xs">
                <span>AI 正在流式输出中...</span>
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="ml-1 px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1"
                  title="停止生成"
                >
                  <Square className="w-2.5 h-2.5 fill-red-500" />
                  <span>停止</span>
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

    </>
  );
}