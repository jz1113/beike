import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  SlidersHorizontal,
} from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';
import {
  applyCreationSkillOverridesToPrompt,
  resolveCreationSkillModifiableSummary,
} from '../model/creationSkillModifiers';
import type { SkillItem } from '../model/skillTypes';
import { SkillCover } from './SkillCover';

interface Props {
  item: SkillItem;
  isFavorite?: boolean;
  onClose: () => void;
  onToggleFavorite?: () => void;
  onUse: (initialPromptOverride?: string) => void;
  onDuplicate?: () => void;
  showToast?: (message: string) => void;
}

function renderFormattedScriptParagraphs(content: string) {
  const blocks = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return <p className="text-slate-400">暂无技能正文</p>;
  }

  return (
    <div className="space-y-3 text-[13.5px] leading-[1.75] text-slate-800 dark:text-slate-200">
      {blocks.map((line, idx) => {
        const isTimelineOrSection =
          /^(VIDEO\s*\d+|00:\d{2}[–-]\d{2}:\d{2}|剧情目标：|声音设计：|全局Hard Lock：|最终End State：)/i.test(
            line,
          );
        return (
          <p
            key={idx}
            className={`break-words ${
              isTimelineOrSection && idx > 0 ? 'pt-1 font-medium text-slate-900 dark:text-white' : ''
            }`}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}

export function CreationSkillDetailModal({
  item,
  onClose,
  onUse,
}: Props) {
  const dialogRef = useModalDialog(true, onClose);
  const [preview, setPreview] = useState(0);
  const [activeFile, setActiveFile] = useState('SKILL.md');
  const [slotOverrides, setSlotOverrides] = useState<Record<string, string>>({});

  const images = [
    ...new Set([item.coverUrl, ...(item.showcaseUrls || [])].filter((url): url is string => Boolean(url))),
  ];
  const files = [
    { path: 'SKILL.md', content: item.prompt || '' },
    ...(item.files || []).filter((file) => file.path.toLowerCase() !== 'skill.md'),
  ];
  const currentFile = files.find((file) => file.path === activeFile) || files[0];
  const isMarkdownFormatted = /^\s*(#{1,6}\s|[-*] |```|\d+\. )/m.test(currentFile.content);

  const modifiable = resolveCreationSkillModifiableSummary(item);
  const primarySlot = modifiable.slots[0];

  const handleUseNow = () => {
    const hasCustomOverrides = Object.values(slotOverrides).some((val) => val.trim().length > 0);
    if (hasCustomOverrides) {
      const promptWithOverrides = applyCreationSkillOverridesToPrompt(
        '',
        item.title,
        slotOverrides,
        modifiable.slots,
      );
      onUse(promptWithOverrides);
    } else {
      onUse();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        tabIndex={-1}
        className="flex max-h-[90dvh] w-full max-w-[600px] flex-col overflow-hidden rounded-[28px] border border-slate-200/90 bg-white text-slate-900 outline-none shadow-[0_24px_70px_rgba(0,0,0,0.28)] dark:border-white/10 dark:bg-[#18191E] dark:text-slate-100"
      >
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none no-scrollbar">
          {/* 顶部 16:9 作品预览 */}
          <div className="p-3 pb-0">
            <div className="relative aspect-[16/9] max-h-[30dvh] w-full overflow-hidden rounded-2xl bg-slate-900">
              {images.length > 0 ? (
                <img
                  src={proxyMediaUrl(images[preview])}
                  alt={`${item.title} 作品预览 ${preview + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <SkillCover skill={item} />
              )}

              <button
                type="button"
                aria-label="关闭详情"
                onClick={onClose}
                className="absolute left-3.5 top-3.5 z-10 flex cursor-pointer items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white outline-none backdrop-blur-md transition hover:bg-black/75 focus:outline-none"
              >
                <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider">
                  ESC
                </span>
                <span>关闭</span>
              </button>

              {images.length > 1 && (
                <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white backdrop-blur-md">
                  <button
                    type="button"
                    aria-label="上一张作品"
                    onClick={() => setPreview((preview + images.length - 1) % images.length)}
                    className="rounded p-0.5 hover:bg-white/15"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="font-mono text-[11px]">
                    {preview + 1} / {images.length}
                  </span>
                  <button
                    type="button"
                    aria-label="下一张作品"
                    onClick={() => setPreview((preview + 1) % images.length)}
                    className="rounded p-0.5 hover:bg-white/15"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 技能标题、模型说明与完整技能内容 */}
          <div className="space-y-4 px-6 pb-2 pt-4">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl dark:text-white">
              {item.title}
            </h2>

            <div className="border-t border-slate-100 pt-3.5 dark:border-white/[0.08]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  默认模型{' '}
                  <strong className="ml-1 font-mono font-semibold text-slate-700 dark:text-slate-200">
                    {item.models || 'SD 2.5'}
                  </strong>
                </p>

                {item.runtime !== 'workshop' && primarySlot && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2.5 py-1 text-xs dark:border-white/10 dark:bg-white/[0.03]">
                    <SlidersHorizontal size={12} className="text-slate-400" />
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {primarySlot.label}：
                    </span>
                    <input
                      type="text"
                      aria-label={`预填${primarySlot.label}`}
                      value={slotOverrides[primarySlot.id] ?? ''}
                      onChange={(e) =>
                        setSlotOverrides((prev) => ({ ...prev, [primarySlot.id]: e.target.value }))
                      }
                      placeholder={`默认 ${primarySlot.defaultValue}（点击可改）`}
                      className="w-32 bg-transparent text-xs font-medium text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
                    />
                  </div>
                )}
              </div>

              <p className="mt-2.5 text-[13px] leading-6 text-slate-600 dark:text-slate-300">
                {item.description}
              </p>
            </div>

            {/* 文件目录与可独立滚动的技能正文 */}
            <div className="pt-1">
              <h3 className="mb-3 text-[15px] font-bold text-slate-900 dark:text-white">
                完整技能内容
              </h3>

              <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200/75 bg-[#F9FAFB] sm:grid-cols-[144px_minmax(0,1fr)] dark:border-white/[0.08] dark:bg-white/[0.02]">
                <nav
                  aria-label="技能文件目录"
                  className="border-b border-slate-200/70 bg-[#F4F5F7]/70 p-3.5 sm:border-b-0 sm:border-r dark:border-white/[0.07] dark:bg-white/[0.015]"
                >
                  <p className="mb-2.5 px-1 text-xs text-slate-400 dark:text-slate-500">目录</p>
                  <div className="flex gap-1.5 overflow-x-auto sm:flex-col">
                    {files.map((file) => {
                      const active = currentFile.path === file.path;
                      return (
                        <button
                          type="button"
                          key={file.path}
                          aria-pressed={active}
                          onClick={() => setActiveFile(file.path)}
                          className={`min-w-0 shrink-0 cursor-pointer break-words rounded-full px-3.5 py-1.5 text-left text-xs transition sm:[overflow-wrap:anywhere] ${
                            active
                              ? 'bg-slate-200/80 font-semibold text-slate-900 dark:bg-white/[0.12] dark:text-white'
                              : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
                          }`}
                        >
                          {file.path}
                        </button>
                      );
                    })}
                  </div>
                </nav>

                <div key={currentFile.path} className="max-h-[260px] select-text overflow-y-auto scrollbar-none no-scrollbar bg-white/80 p-4 sm:p-5 dark:bg-[#1B1D24]/60">
                  {isMarkdownFormatted ? (
                    <MarkdownBody
                      content={currentFile.content}
                      accentColor="slate"
                      className="break-words text-[13.5px] leading-[1.75] text-slate-800 dark:text-slate-200"
                    />
                  ) : (
                    renderFormattedScriptParagraphs(currentFile.content)
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 固定底部主要操作，长内容滚动时仍可使用技能 */}
        <footer className="flex shrink-0 items-center justify-end bg-white/95 px-6 pb-5 pt-3 backdrop-blur-md dark:bg-[#18191E]/95">
          <button
            type="button"
            onClick={handleUseNow}
            className="flex cursor-pointer items-center gap-1.5 rounded-full bg-slate-950 px-6 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-95 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <span>{item.runtime === 'workshop' ? '应用到电商图文' : '立即使用'}</span>
            <CornerDownLeft size={13} />
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
