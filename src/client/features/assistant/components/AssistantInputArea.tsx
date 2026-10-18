import { useAssistantImageMentions } from '../hooks/useAssistantImageMentions';
import { removeImageMention } from '../model/assistantMentions';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { ArrowUp, FileText, Play, Square, X, PanelsTopLeft } from 'lucide-react';
import { AssistantSkillIcon } from '@client/features/assistant/components/skill/AssistantSkillIcon';
import { MediaAttachment } from '@client/store';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import AssistantModelPicker from './panels/AssistantModelPicker';
import type { ReasoningEffort } from '@shared/domain/assistant/reasoning';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import {
  FILE_ACCEPT,
} from '@client/features/assistant/model/assistantConstants';
import AssistantSkillsMenu from '@client/features/assistant/components/skill/AssistantSkillsMenu';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@client/store';
import type { AssistantSkillInputRequirement } from '@shared/domain/assistant/skills/types';



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
  isUploading?: boolean;
  isSending: boolean;
  isSendingCurrent: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFiles: (files: FileList | File[]) => void;
  showModelMenu: boolean;
  setShowModelMenu: (v: boolean) => void;
  modelMenuRef: React.RefObject<HTMLDivElement | null>;
  availableAssistantModels: any[];
  currentModelObj: { name?: string; shortName?: string; id?: string; provider?: string; badge?: string };
  reasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (value: ReasoningEffort) => void;
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
  isUploading,
  isSendingCurrent,
  fileInputRef,
  handleFiles,
  showModelMenu,
  setShowModelMenu,
  modelMenuRef,
  availableAssistantModels,
  currentModelObj,
  reasoningEffort,
  onReasoningEffortChange,
  assistantModel,
  setAssistantModel,
  resolveAssistantMediaSrc,
  setChatPreview,
  workspaceContext,
}: AssistantInputAreaProps) {
  const composerRef = useRef<HTMLDivElement>(null);
  const mentions = useAssistantImageMentions({ text: inputContent, setText: setInputContent, attachments: assistantAttachments, textareaRef });
  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const measure = () => {
      const panel = composer.closest('.agent-panel');
      const top = composer.getBoundingClientRect().top;
      const panelTop = panel?.getBoundingClientRect().top || 0;
      // Picker menus open directly above their toolbar buttons, overlapping the writing area.
      const pickerTop = composer.querySelector('.agent-model-picker')?.getBoundingClientRect().top ?? top;
      const headerBottom = panel?.querySelector('.agent-header')?.getBoundingClientRect().bottom ?? panelTop;
      composer.style.setProperty('--agent-picker-space', `${Math.max(80, pickerTop - headerBottom - 16)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const { activeSkill, setActiveAssistantSkillId } = useAppStore(
    useShallow((s) => ({
      activeSkill: s.getActiveAssistantSkill(),
      setActiveAssistantSkillId: s.setActiveAssistantSkillId,
    })),
  );
  const hasPreview = Boolean(activeSkill) || assistantAttachments.length > 0;
  const missingRequirements = getMissingRequirements(
    activeSkill?.requires,
    assistantAttachments,
    inputContent,
  );

  // 内容变化时调整高度；达到上限后仅正文区域滚动。
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const nextH = Math.min(Math.max(textareaRef.current.scrollHeight, 26), 160);
      textareaRef.current.style.height = `${nextH}px`;
    }
  }, [inputContent, activeSkill, textareaRef]);

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
    if (mentions.onKeyDown(e)) return;
    // 当输入框内容为空且按退格键时，快速移除当前激活的技能标签（与 Cursor/Claude Token 体验一致）
    if (e.key === 'Backspace' && inputContent === '' && activeSkill) {
      e.preventDefault();
      setActiveAssistantSkillId(null);
      return;
    }
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' && !e.shiftKey && isSending) { e.preventDefault(); return; }
    handleKeyDown(e);
  };

  return (
    <>
      <div className="agent-composer-wrap">
        <div 
          ref={composerRef}
          className="agent-composer"
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest('button, textarea, input, select, label, a')) {
              textareaRef.current?.focus();
            }
          }}
        >
          {/* 附件缩略图预览（位于输入卡片内部顶部，整齐紧凑） */}
          {workspaceContext && (
            <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 dark:bg-white/5 dark:border-white/10">
                <PanelsTopLeft className="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400" />
                <span className="shrink-0 font-medium text-slate-600 dark:text-slate-300">{workspaceContext.label}</span>
                <span className="min-w-0 truncate text-slate-400">{workspaceContext.detail}</span>
              </span>
            </div>
          )}
          {assistantAttachments.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-2 animate-fade-in">
              {assistantAttachments.map((att, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100 group/att shadow-2xs dark:bg-white/10 dark:border-white/10">
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
                  {att.type !== 'document' && <span className="absolute bottom-0 inset-x-0 bg-white/90 px-1.5 py-1 text-[9px] text-slate-600 truncate pointer-events-none dark:text-slate-300 dark:bg-[#18191c]/95" title={att.name}>{att.mentionName ? `@${att.mentionName} · ${att.name || '图片'}` : att.name || (att.type === 'video' ? '视频附件' : '图片附件')}</span>}
                  <button
                    type="button"
                    aria-label={`移除附件 ${att.name || idx + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setInputContent(removeImageMention(inputContent, att.mentionName));
                      removeAssistantAttachment(idx);
                    }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/80 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-2xs z-10 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 已选技能与正文分开，避免遮挡输入或跳动。 */}
          <div
            className="relative min-h-[52px] min-w-0 overflow-hidden cursor-text"
            onClick={() => textareaRef.current?.focus()}
          >
            {activeSkill && (
              <div
                className="agent-active-skill"
                title={`${activeSkill.displayName || activeSkill.name}（输入为空时按退格键可移除）`}
              >
                <AssistantSkillIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" strokeWidth={1.8} />
                <span className="min-w-0 truncate text-xs text-slate-900 dark:text-slate-100">{activeSkill.displayName || activeSkill.name}</span>
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
              onChange={e => { setInputContent(e.target.value); mentions.update(e.target.value, e.target.selectionStart); }}
              onSelect={e => { const el = e.currentTarget; if (el.selectionStart === el.selectionEnd) mentions.update(el.value, el.selectionStart); else mentions.close(); }}
              onBlur={e => { if (!mentions.menuRef.current?.contains(e.relatedTarget)) mentions.close(); }}
              aria-expanded={mentions.open}
              aria-controls={mentions.open ? `${mentions.id}-images` : undefined}
              aria-activedescendant={mentions.open && mentions.options.length ? `${mentions.id}-image-${mentions.activeIndex}` : undefined}
              aria-autocomplete="list"
              onKeyDown={handleKeyDownInternal}
              onPaste={handlePaste}
              placeholder={
                activeSkill
                  ? "输入此技能的需求…"
                  : "描述你的想法，输入 @ 引用图片…"
              }
              rows={1}
              aria-label="消息内容"
              className="block w-full min-w-0 max-h-40 bg-transparent border-0 text-slate-800 placeholder-slate-400 text-xs sm:text-sm resize-none outline-none leading-6 p-0 m-0 pt-1 overflow-x-hidden overflow-y-auto dark:text-slate-100"
            />
          </div>

          {missingRequirements.length > 0 && <p className="text-[10px] text-slate-400 mt-1">
            此技能建议补充：{missingRequirements.map(value => ({ image: '图片 / 视频', document: '文档', url: '链接' })[value]).join('、')}
          </p>}
          {mentions.open && <div ref={mentions.menuRef} className="agent-popover agent-image-mentions" onMouseDown={e => e.preventDefault()}>
            <div className="agent-popover-heading"><span>引用图片主体</span><span>↑ ↓ 选择 · Enter 确认</span></div>
            <div role="listbox" id={`${mentions.id}-images`} aria-label="可引用图片" className="agent-image-mention-list">
              {mentions.options.map((item, index) => <button key={item.url} type="button" role="option" id={`${mentions.id}-image-${index}`} aria-selected={index === mentions.activeIndex} onMouseMove={() => mentions.setActive(index)} onClick={() => mentions.select(item)}>
                <img src={resolveAssistantMediaSrc(item.thumbnailUrl || item.url, false)} alt="" referrerPolicy="no-referrer" />
                <span><strong>{item.name || '未命名图片'}</strong><small>{item.mentionName ? `@${item.mentionName} · ` : ''}{item.source}</small></span>
              </button>)}
            </div>
            {!mentions.options.length && <p className="agent-empty-result">{assistantAttachments.some(a => a.type === 'image') ? '没有匹配的图片，试试文件名' : '先添加图片，再用 @ 指定创作主体'}</p>}
            <button type="button" className="agent-mention-upload" onClick={() => { mentions.close(); fileInputRef.current?.click(); }}>＋ 添加图片</button>
          </div>}
          <div className="agent-composer-toolbar">
            <div className="agent-composer-tools">
              <AssistantSkillsMenu
                showToast={showToast}
                onUploadFiles={() => fileInputRef.current?.click()}
                hasContext={hasPreview}
              />
            </div>

            <div className="agent-composer-submit">
              <AssistantModelPicker models={availableAssistantModels} model={assistantModel} current={currentModelObj}
                onModelChange={setAssistantModel} effort={reasoningEffort} onEffortChange={onReasoningEffortChange}
                open={showModelMenu} onOpenChange={setShowModelMenu} menuRef={modelMenuRef} />

              {isSendingCurrent ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  className="agent-send-button group/stop"
                  aria-label="停止本轮"
                  title="停止本轮"
                >
                  <Square className="w-3 h-3 fill-current text-white group-hover/stop:scale-110 transition-transform" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={isSending || (!inputContent.trim() && assistantAttachments.length === 0)}
                  className="agent-send-button"
                  aria-label="发送消息"
                  title="发送消息 (Enter)"
                >
                  <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="agent-composer-hint"><span role="status">{isUploading ? '正在读取附件…' : '支持粘贴 / 拖入附件'}</span><span>Enter 发送 · Shift + Enter 换行</span></div>
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
