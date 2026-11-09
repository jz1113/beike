import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Copy,
  FileText,
  Folder,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { videoPlaybackManager } from '@client/shared/media/videoPlaybackManager';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';
import {
  applyCreationSkillOverridesToPrompt,
  resolveCreationSkillModifiableSummary,
} from '../model/creationSkillModifiers';
import type { SkillItem } from '../model/skillTypes';
import { skillFilePreview, skillSourceLabel } from '../model/buildSkillFromStudio';
import { creationSkillFlow, skillActivationPrompt } from '../model/creationSkillFlows';
import { buildTreeFromPaths, type SkillFileNode } from '../model/skillFileTree';
import { SkillCover } from './SkillCard';

interface Props {
  item: SkillItem;
  isFavorite?: boolean;
  onClose: () => void;
  onToggleFavorite?: () => void;
  onUse: (initialPromptOverride?: string, referenceImages?: string[]) => void;
  useOnly?: boolean;
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
    <div className="space-y-2 text-[12px]/[18px] font-normal text-slate-800 dark:text-slate-200">
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
  isFavorite = false,
  onToggleFavorite,
  useOnly = false,
  onDuplicate,
  showToast,
  onClose,
  onUse,
}: Props) {
  const dialogRef = useModalDialog(true, onClose);
  const [preview, setPreview] = useState(0);
  const [failedVideo, setFailedVideo] = useState('');
  const [activeFile, setActiveFile] = useState('SKILL.md');
  const [slotOverrides, setSlotOverrides] = useState<Record<string, string>>({});
  useEffect(() => videoPlaybackManager.suspend(), []);

  const images = [
    ...new Set([item.coverUrl, ...(item.showcaseUrls || [])].filter((url): url is string => Boolean(url))),
  ];
  const files = [
    { path: 'SKILL.md', content: item.prompt || '' },
    ...(item.files || []).filter((file) => file.path.toLowerCase() !== 'skill.md'),
  ];
  const currentFile = files.find((file) => file.path === activeFile) || files[0];
  const previewBody = skillFilePreview(currentFile).body;
  const isMarkdownFormatted = /^\s*(#{1,6}\s|[-*] |```|\d+\. )/m.test(previewBody);

  const modifiable = resolveCreationSkillModifiableSummary(item);
  const primarySlot = modifiable.slots[0];
  const flow = creationSkillFlow(item.id);
  const handleUseExample = () => onUse(
    skillActivationPrompt(item.id, item.title, '', item.example?.prompt || flow?.example || ''),
    item.example ? [...item.example.referenceImages] : undefined,
  );

  const handleUseNow = () => {
    if (flow) { onUse(); return; }
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
        className="flex max-h-[calc(100dvh-3rem)] w-full max-w-[600px] sm:max-h-[min(1050px,88dvh)] flex-col overflow-hidden rounded-[32px] border border-slate-200/90 bg-white text-slate-900 outline-none shadow-[0_24px_70px_rgba(0,0,0,0.28)] dark:border-white/10 dark:bg-[#252525] dark:text-slate-100"
      >
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none no-scrollbar">
          {/* 顶部 16:9 作品预览 */}
          <div className="px-[11px] pt-[11px]">
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[24px] bg-slate-900">
              {images.length > 0 && isVideoMediaUrl(images[preview]) ? (
                failedVideo === images[preview]
                  ? <p role="status" className="flex h-full items-center justify-center px-6 text-sm text-white/70">案例视频暂时无法播放，请检查素材链接。</p>
                  : <video key={images[preview]} src={proxyMediaUrl(images[preview], { asVideo: true })} controls playsInline preload="metadata" poster={item.coverPosterUrl}
                    aria-label={`${item.title} 案例视频`} onError={() => setFailedVideo(images[preview])} className="h-full w-full object-contain" />
              ) : images.length > 0 ? (
                <img
                  src={proxyMediaUrl(images[preview])}
                  alt={`${item.title} 作品预览 ${preview + 1}`}
                  className={`h-full w-full ${item.coverFit === 'contain' ? 'bg-[#f2f2f2] object-contain' : 'object-cover'}`}
                />
              ) : (
                <SkillCover skill={item} />
              )}

              <button
                type="button"
                aria-label="关闭详情"
                onClick={onClose}
                className="absolute left-2 top-2 z-10 flex cursor-pointer items-center gap-1.5 rounded-lg bg-black/55 px-1.5 py-1 text-[11px] font-normal text-white backdrop-blur-md transition hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-white"
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
          <div className="space-y-4 px-4 pb-3 pt-4 sm:px-[27px]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="min-w-0 text-base font-semibold text-slate-900 dark:text-white">{item.title}</h2>
              {onToggleFavorite && <button type="button" onClick={onToggleFavorite} aria-pressed={isFavorite}
                aria-label={`${isFavorite ? '取消收藏' : '收藏技能'} ${item.title}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-neutral-300 dark:hover:bg-white/5">
                <Star size={14} className={isFavorite ? 'fill-current' : ''} />{isFavorite ? '已收藏' : '收藏'}
              </button>}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-neutral-400">
              {item.author && <div className="flex gap-2"><dt>作者</dt><dd className="text-slate-700 dark:text-neutral-200">{item.author}</dd></div>}
              {item.usageCount !== undefined && <div className="flex gap-2"><dt>使用次数</dt><dd>{item.usageCount.toLocaleString()}</dd></div>}
              {item.favoriteCount !== undefined && <div className="flex gap-2"><dt>收藏数</dt><dd>{item.favoriteCount.toLocaleString()}</dd></div>}
            </dl>
            {item.source && <p title={item.source.license} className="text-xs leading-6 text-slate-500 dark:text-neutral-400">
              <span>{item.source.kind === 'local' ? skillSourceLabel(item.source) : <a href={item.source.url} target="_blank" rel="noreferrer" className="underline focus-visible:outline-2 focus-visible:outline-blue-500">{skillSourceLabel(item.source)}</a>}</span>
              {' · '}{item.source.revision}{item.source.kind !== 'local' && <><br />{item.source.license}</>}
            </p>}

            <div className="border-t border-slate-100 pt-3 dark:border-white/[0.08]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  默认模型{' '}
                  <strong className="ml-1 font-mono font-semibold text-slate-700 dark:text-slate-200">
                    {item.models || '跟随当前创作配置'}
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
              <div className="mt-3 flex flex-wrap gap-2">{[...new Set([item.category, ...(item.tags || [])])].filter(Boolean).map(tag =>
                <span key={tag} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:bg-white/5 dark:text-neutral-400">{tag}</span>)}</div>
            </div>

            <section aria-labelledby="creation-skill-content-heading" className="pt-2">
              <h3 id="creation-skill-content-heading" className="mb-5 text-[15px] font-medium">完整技能内容</h3>
              <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200/75 bg-[#F9FAFB] sm:grid-cols-[140px_minmax(0,1fr)] dark:border-white/[0.08] dark:bg-white/[0.02]">
                <nav
                  aria-label="技能文件目录"
                  className="border-b border-slate-200/70 bg-[#F4F5F7]/70 max-h-28 overflow-y-auto p-3 sm:max-h-[clamp(192px,27dvh,320px)] sm:border-b-0 sm:border-r dark:border-white/[0.07] dark:bg-white/[0.015]"
                >
                  <p className="mb-2 px-1 text-[11px] leading-4 text-slate-400 dark:text-slate-500">目录</p>
                  <SkillDirectory
                    nodes={buildTreeFromPaths(new Map(files.map(({ path, content }) => [path, content])))}
                    activePath={currentFile.path}
                    onSelect={setActiveFile}
                  />
                </nav>

                <div key={currentFile.path} className="max-h-[clamp(192px,27dvh,320px)] select-text overflow-y-auto scrollbar-none no-scrollbar bg-white/80 p-4 sm:p-5 dark:bg-[#1B1D24]/60">
                  {isMarkdownFormatted ? (
                    <MarkdownBody
                      content={previewBody}
                      accentColor="slate"
                      className="break-words text-[12px]/[18px]! font-normal [&_p]:leading-[18px] [&_.flex-1]:leading-[18px] [&_h3]:text-[15px] [&_h4]:text-sm [&_h5]:text-[13px] [&_h6]:text-[13px] [&_:is(h3,h4,h5,h6)]:font-semibold"
                    />
                  ) : (
                    renderFormattedScriptParagraphs(previewBody)
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* 固定底部主要操作，长内容滚动时仍可使用技能 */}
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 bg-white/95 px-4 pb-4 pt-3 backdrop-blur-md sm:pt-6 dark:bg-[#252525]/95">
          {!useOnly && onDuplicate && <button type="button" onClick={onDuplicate} className="mr-auto rounded-full px-3 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:text-neutral-400 dark:hover:bg-white/5">复制为我的技能</button>}
          {!useOnly && <button type="button" onClick={async () => {
            try { await navigator.clipboard.writeText(files[0].content); showToast?.('已复制技能正文，可粘贴分享'); }
            catch { showToast?.('复制失败，请检查剪贴板权限'); }
          }} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/5"><Copy size={13} />复制技能</button>}
          <button
            type="button"
            onClick={handleUseNow}
            className={`flex min-h-[40px] min-w-[118px] cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-[12px] font-medium transition active:scale-95 ${!useOnly && item.example ? 'text-slate-600 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-white/5' : 'bg-slate-950 text-white shadow-sm hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200'}`}
          >
            <span>{useOnly ? '使用' : item.runtime === 'workshop' ? '应用到电商图文' : '立即使用'}</span>
            <CornerDownLeft size={13} />
          </button>
          {!useOnly && (item.example || flow?.example) && <button type="button" onClick={handleUseExample} aria-label={`使用示例 ${item.title}`} className="flex items-center gap-1.5 rounded-full bg-slate-950 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">使用示例<CornerDownLeft size={13} /></button>}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function SkillDirectory({ nodes, activePath, onSelect, prefix = '' }: {
  nodes: SkillFileNode[];
  activePath: string;
  onSelect: (path: string) => void;
  prefix?: string;
}) {
  return (
    <ul className="min-w-0 space-y-0.5 text-[11px] leading-4">
      {nodes.map((node) => {
        const path = prefix + node.name;
        return (
          <li key={node.id}>
            {node.type === 'folder' ? (
              <details open={activePath.startsWith(path + '/') || undefined}>
                <summary className="cursor-pointer truncate rounded px-1 py-1 text-slate-600 dark:text-slate-300" title={path}>
                  <Folder size={12} className="mx-1 inline-block align-text-bottom" aria-hidden="true" />
                  {node.name}
                </summary>
                <div className="pl-2">
                  <SkillDirectory nodes={node.children || []} activePath={activePath} onSelect={onSelect} prefix={path + '/'} />
                </div>
              </details>
            ) : (
              <button
                type="button"
                title={path}
                aria-pressed={path === activePath}
                onClick={() => onSelect(path)}
                className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-slate-600 hover:bg-slate-100 aria-pressed:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/5 dark:aria-pressed:bg-white/10"
              >
                <FileText size={12} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{node.name}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
