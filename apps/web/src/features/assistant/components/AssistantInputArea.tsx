import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, FileText, Play, Square, X, PanelsTopLeft } from 'lucide-react';
import { AssistantSkillIcon } from '@/features/assistant/components/AssistantSkillIcon';
import { MediaAttachment } from '@/store';
import { proxyMediaUrl } from '@/shared/api/apiClient';
import { getModelIcon } from '@/shared/ui/ModelIcons';
import { isVideoMediaUrl } from '@/shared/media/mediaHelper';
import {
  FILE_ACCEPT,
  resolveAssistantModelLabel,
} from '@/features/assistant/utils/assistantConstants';
import AssistantSkillsMenu from '@/features/assistant/components/AssistantSkillsMenu';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store';
import type { AssistantSkillInputRequirement } from '@beike/domain/assistant/skills/types';



function getMissingRequirements(
  requires: AssistantSkillInputRequirement[] | undefined,
  attachments: MediaAttachment[],
  inputContent: string,
): AssistantSkillInputRequirement[] {
  if (!requires || requires.length === 0) return [];
  const missing: AssistantSkillInputRequirement[] = [];
  const hasImage = attachments.some(a => a.type === 'image' || a.type === 'video');
  const hasDoc = attachments.some(a => a.type === 'document');
  const hasUrl = /https?:\/\/[^\s]+/i.test(inputContent);

  for (const req of requires) {
    if (req === 'image' && !hasImage) missing.push('image');
    if (req === 'document' && !hasDoc) missing.push('document');
    if (req === 'url' && !hasUrl) missing.push('url');
  }
  return missing;
}



export interface AssistantInputAreaProps {
  assistantAttachments: MediaAttachment[];
  removeAssistantAttachment: (idx: number) => void;
  showToast: (msg: string) => void;
  inputContent: string;
  setInputContent: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  handleSendMessage: (overrideContent?: string) => void;
  handleStopGeneration?: () => void;
  isSending: boolean;
  isSendingCurrent: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFiles: (files: FileList | File[]) => void;
  showModelMenu: boolean;
  setShowModelMenu: (v: boolean) => void;
  modelMenuRef: React.RefObject<HTMLDivElement | null>;
  availableAssistantModels: any[];
  currentModelObj: { name?: string; shortName?: string; id?: string; provider?: string; badge?: string };
  assistantModel: string;
  setAssistantModel: (id: string) => void;
  resolveAssistantMediaSrc: (rawUrl?: string | null, asVideo?: boolean) => string;
  setChatPreview: (v: { url: string; type: 'image' | 'video'; poster?: string } | null) => void;
  onOpenBrandKitModal?: () => void;
  addAssistantAttachment?: (att: MediaAttachment) => void;
  workspaceContext?: { label: string; detail: string };
}

export default function AssistantInputArea({
  assistantAttachments,
  removeAssistantAttachment,
  showToast,
  inputContent,
  setInputContent,
  textareaRef,
  handleKeyDown,
  handlePaste,
  handleSendMessage,
  handleStopGeneration,
  isSending,
  isSendingCurrent,
  fileInputRef,
  handleFiles,
  showModelMenu,
  setShowModelMenu,
  modelMenuRef,
  availableAssistantModels,
  currentModelObj,
  assistantModel,
  setAssistantModel,
  resolveAssistantMediaSrc,
  setChatPreview,
  workspaceContext,
}: AssistantInputAreaProps) {
  const skillTokenRef = useRef<HTMLDivElement>(null);
  const [skillTokenWidth, setSkillTokenWidth] = useState(0);
  const [inputScrollTop, setInputScrollTop] = useState(0);
  const [showAllModels, setShowAllModels] = useState(false);
  const { activeSkill, setActiveAssistantSkillId } = useAppStore(
    useShallow((s) => ({
      activeSkill: s.getActiveAssistantSkill(),
      setActiveAssistantSkillId: s.setActiveAssistantSkillId,
    })),
  );
  const pillLabel = resolveAssistantModelLabel({
    id: assistantModel,
    name: currentModelObj.name,
    shortName: currentModelObj.shortName,
  });

  const hasPreview = Boolean(activeSkill) || assistantAttachments.length > 0;
  const missingRequirements = getMissingRequirements(
    activeSkill?.requires,
    assistantAttachments,
    inputContent,
  );

  // 仅缩进正文首行，为技能标签留位，后续行恢复完整宽度。
  useLayoutEffect(() => {
    const token = skillTokenRef.current;
    if (!token) { setSkillTokenWidth(0); return; }
    const measure = () => setSkillTokenWidth(token.getBoundingClientRect().width + 6);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(token);
    return () => observer.disconnect();
  }, [activeSkill]);

  // 内容变化时调整高度；达到上限后仅正文区域滚动。
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const nextH = Math.min(Math.max(textareaRef.current.scrollHeight, 26), 160);
      textareaRef.current.style.height = `${nextH}px`;
      setInputScrollTop(textareaRef.current.scrollTop);
    }
  }, [inputContent, activeSkill, skillTokenWidth, textareaRef]);

  // 抽屉宽度变化会改变文本换行，需要重新测量高度。
  useEffect(() => {
    const textarea = textareaRef.current;
    const container = textarea?.parentElement;
    if (!textarea || !container || typeof ResizeObserver === 'undefined') return;
    let previousWidth = container.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      if (width === previousWidth) return;
      previousWidth = width;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 26), 160)}px`;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [textareaRef]);

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 当输入框内容为空且按退格键时，快速移除当前激活的技能标签（与 Cursor/Claude Token 体验一致）
    if (e.key === 'Backspace' && inputContent === '' && activeSkill) {
      e.preventDefault();
      setActiveAssistantSkillId(null);
      return;
    }
    handleKeyDown(e);
  };

  return (
    <>
      <div className="p-4 bg-transparent shrink-0">
        <div 
          className="relative rounded-2xl bg-white border border-zinc-300/80 focus-within:border-zinc-400 focus-within:bg-white p-3 shadow-2xs transition-all cursor-text"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('button, textarea, input, select, label, a')) {
              textareaRef.current?.focus();
            }
          }}
        >
          {/* 附件缩略图预览（位于输入卡片内部顶部，整齐紧凑） */}
          {workspaceContext && (
            <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500">
              <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1">
                <PanelsTopLeft className="h-3 w-3 shrink-0 text-slate-500" />
                <span className="shrink-0 font-medium text-slate-600">{workspaceContext.label}</span>
                <span className="min-w-0 truncate text-slate-400">{workspaceContext.detail}</span>
              </span>
            </div>
          )}
          {assistantAttachments.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-2 animate-fade-in">
              {assistantAttachments.map((att, idx) => (
                <div key={idx} className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100 group/att shadow-2xs">
                  {att.type === 'document' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 bg-indigo-50 px-0.5">
                      <FileText className="w-5 h-5 text-indigo-600" />
                      <span className="text-[8px] text-indigo-800 font-medium truncate max-w-full px-0.5">{att.name || '文档'}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="absolute inset-0 w-full h-full cursor-pointer"
                      title={att.type === 'video' ? '预览视频' : '预览图片'}
                      onClick={() => {
                        if (att.type === 'video' && att.url) {
                          setChatPreview({ url: att.url, type: 'video', poster: att.thumbnailUrl });
                        } else if (att.url || att.thumbnailUrl) {
                          setChatPreview({ url: att.url || att.thumbnailUrl || '', type: 'image' });
                        }
                      }}
                    >
                      {att.type === 'video' && (!att.thumbnailUrl || isVideoMediaUrl(att.thumbnailUrl)) ? (
                        <video
                          src={resolveAssistantMediaSrc(att.url, true)}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      ) : (
                        <img
                          src={resolveAssistantMediaSrc(att.thumbnailUrl || att.url, false)}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.currentTarget;
                            const u = att.thumbnailUrl || att.url;
                            if (!target.dataset.hasRetried && u && !u.startsWith('data:') && !u.startsWith('blob:')) {
                              target.dataset.hasRetried = 'true';
                              target.src = proxyMediaUrl(u);
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {att.type === 'video' && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </div>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAssistantAttachment(idx);
                    }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-slate-900/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-2xs z-10 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 技能覆盖在首行预留位置，正文换行后从左侧铺满 */}
          <div
            className="relative min-h-[52px] min-w-0 overflow-hidden cursor-text"
            onClick={() => textareaRef.current?.focus()}
          >
            {activeSkill && (
              <div
                ref={skillTokenRef}
                style={{ transform: `translateY(${-inputScrollTop}px)` }}
                className="absolute left-0 top-1 z-10 h-[22px] inline-flex max-w-[45%] min-w-0 items-center gap-1 px-1.5 py-0 rounded-lg bg-slate-100 hover:bg-slate-200/80 border border-slate-200/90 text-xs text-slate-800 font-medium select-none transition-colors shadow-2xs group"
                title={`${activeSkill.displayName || activeSkill.name}（输入为空时按退格键可移除）`}
              >
                <AssistantSkillIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" strokeWidth={1.8} />
                <span className="min-w-0 truncate text-xs text-slate-900">{activeSkill.displayName || activeSkill.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveAssistantSkillId(null);
                  }}
                  className="shrink-0 p-0.5 rounded hover:bg-slate-300 text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-violet-500 transition-colors ml-0.5 cursor-pointer"
                  aria-label="移除当前技能"
                  title="移除技能（输入为空时也可按退格键）"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={inputContent}
              onChange={e => setInputContent(e.target.value)}
              onKeyDown={handleKeyDownInternal}
              onPaste={handlePaste}
              onScroll={e => setInputScrollTop(e.currentTarget.scrollTop)}
              style={{ textIndent: activeSkill ? `${skillTokenWidth}px` : undefined }}
              placeholder={
                activeSkill
                  ? "输入此技能的需求…"
                  : "粘贴小红书链接采集；完成后另发指令分析或挑图…"
              }
              rows={1}
              aria-label="消息内容"
              className="block w-full min-w-0 max-h-40 bg-transparent border-0 text-slate-800 placeholder-slate-400 text-xs sm:text-sm resize-none outline-none leading-6 p-0 m-0 pt-1 overflow-x-hidden overflow-y-auto"
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-1.5 text-xs text-slate-500 relative">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 relative z-30 overflow-visible">
              <AssistantSkillsMenu
                showToast={showToast}
                onUploadFiles={() => fileInputRef.current?.click()}
                hasContext={hasPreview}
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto relative z-30">
              <div className="relative shrink-0" ref={modelMenuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowModelMenu(!showModelMenu);
                  }}
                  className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-semibold transition-all cursor-pointer border ${
                    showModelMenu
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-200/70 shadow-2xs'
                  }`}
                  title="切换对话与视觉分析模型"
                >
                  <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                    {getModelIcon(assistantModel, 'w-3.5 h-3.5 shrink-0')}
                  </div>
                  <span className="text-[11.5px] truncate max-w-[100px] sm:max-w-[140px] font-medium">
                    {pillLabel}
                  </span>
                  <ChevronDown className={`w-3 h-3 opacity-60 transition-transform duration-200 ${showModelMenu ? 'rotate-180' : ''}`} />
                </button>

                {showModelMenu && (
                  <div
                    className="absolute bottom-full mb-2 right-0 w-72 sm:w-80 rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.15)] p-2 z-70 space-y-1 animate-fade-in text-left text-slate-800"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-2 py-1 text-[11px] text-slate-400 font-medium">
                      对话与视觉模型
                    </div>

                    <div className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin p-0.5">
                      {availableAssistantModels
                        .slice(0, showAllModels ? undefined : 6)
                        .map(m => {
                          const isCurrent = assistantModel === m.id;
                          const label = resolveAssistantModelLabel(m);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setAssistantModel(m.id);
                                setShowModelMenu(false);
                              }}
                              className={`w-full p-2 rounded-xl text-xs flex items-center justify-between transition-all cursor-pointer text-left border ${
                                isCurrent
                                  ? 'bg-slate-50 border-slate-300 text-slate-900 shadow-xs'
                                  : 'hover:bg-slate-100 text-slate-700 border-transparent'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 text-slate-700 border border-slate-100">
                                  {getModelIcon(m.id, 'w-3.5 h-3.5')}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                    <span className={`truncate min-w-0 text-xs ${isCurrent ? 'font-bold' : 'font-semibold'}`}>
                                      {label}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {isCurrent && <Check className="w-4 h-4 text-slate-900 stroke-[2.5] shrink-0 ml-1.5" />}
                            </button>
                          );
                        })}
                    </div>

                    {availableAssistantModels.length > 6 && (
                      <div className="pt-0.5 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setShowAllModels(!showAllModels)}
                          className="w-full px-2.5 py-1.5 rounded-xl hover:bg-slate-100 text-xs text-slate-600 flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <span>{showAllModels ? '收起部分模型' : '更多模型'}</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllModels ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isSendingCurrent ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="w-8 h-8 rounded-full bg-slate-900 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md shadow-slate-900/25 shrink-0 group/stop"
                  title="停止生成 (Stop)"
                >
                  <Square className="w-3 h-3 fill-current text-white group-hover/stop:scale-110 transition-transform" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={isSending || (!inputContent.trim() && assistantAttachments.length === 0)}
                  className="w-8 h-8 rounded-full bg-linear-to-tr from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shadow-md shadow-slate-900/20 shrink-0"
                  title="发送消息 (Enter)"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={e => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
          accept={FILE_ACCEPT}
          multiple
          className="hidden"
        />
      </div>
    </>
  );
}
