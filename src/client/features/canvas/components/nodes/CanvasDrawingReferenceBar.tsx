import { useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, ArrowLeftRight, ChevronLeft, ChevronRight, Eye, Loader2, Plus, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import type { CanvasNode } from '../../model/types';

export interface CanvasDrawingReferenceBarProps {
  isVideo: boolean;
  videoMode?: string;
  uploading: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  refs: string[];
  referenceNames: string[];
  linkedNodes: CanvasNode[];
  linkedTextNodes: CanvasNode[];
  availableCanvasMediaNodes?: CanvasNode[];
  showUpstreamTextPreview?: boolean;
  onToggleUpstreamTextPreview?: () => void;
  promptLibraryOpen?: boolean;
  onTogglePromptLibrary?: () => void;
  rightSlot?: ReactNode;
  onUploadFiles: (files: File[]) => void;
  onConnectCanvasNode?: (nodeId: string) => void;
  onInsertMediaRef: (index: number) => void;
  onInsertTextRef: (token: string) => void;
  onRemoveMediaRef: (url: string) => void;
  onSwapFirstLast: () => void;
  onMoveMediaRef: (index: number, direction: -1 | 1) => void;
  onReorderMediaRef?: (fromIndex: number, toIndex: number) => void;
  onDisconnectTextNode: (nodeId: string) => void;
}

function dispatchHighlightNode(nodeId: string | null) {
  window.dispatchEvent(new CustomEvent('canvas:highlight-ref-node', { detail: { nodeId } }));
}

export function CanvasDrawingReferenceBar({
  isVideo,
  videoMode,
  uploading,
  fileInputRef,
  refs,
  referenceNames,
  linkedNodes,
  linkedTextNodes,
  showUpstreamTextPreview = false,
  onToggleUpstreamTextPreview,
  promptLibraryOpen = false,
  onTogglePromptLibrary,
  rightSlot,
  onUploadFiles,
  onInsertMediaRef,
  onInsertTextRef,
  onRemoveMediaRef,
  onSwapFirstLast,
  onMoveMediaRef,
  onReorderMediaRef,
  onDisconnectTextNode,
}: CanvasDrawingReferenceBarProps) {
  const isFirstLastMode = isVideo && (videoMode === 'first_last_frame' || videoMode === 'first_frame');
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{
    url: string;
    label: string;
    sourceTitle?: string;
    left: number;
    top: number;
  } | null>(null);

  const findSourceNodeForUrl = (url: string): CanvasNode | undefined =>
    linkedNodes.find((n) => n.videoUrl === url || n.imageUrl === url);

  const handleReorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= refs.length || to >= refs.length) return;
    if (onReorderMediaRef) {
      onReorderMediaRef(from, to);
      return;
    }
    const step = to > from ? 1 : -1;
    for (let idx = from; idx !== to; idx += step) {
      onMoveMediaRef(idx, step as -1 | 1);
    }
  };

  return (
    <div className="mb-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={isVideo ? 'image/*,video/*' : 'image/*'}
        multiple
        className="hidden"
        aria-label="选择参考素材文件"
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = '';
          onUploadFiles(files);
        }}
      />

      {/* 单行紧凑参考栏：[🪄] | [≡ 关联文本] [参考缩略图...] [+] */}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {!isVideo && onTogglePromptLibrary && (
          <>
            <button
              type="button"
              aria-label="常用提示词库快捷开关"
              aria-pressed={promptLibraryOpen}
              onClick={onTogglePromptLibrary}
              title="展开 / 收起常用提示词库"
              className={`inline-flex size-11 shrink-0 items-center justify-center rounded-[12px] border transition-colors cursor-pointer ${
                promptLibraryOpen
                  ? 'border-white/25 bg-white/[0.14] text-white'
                  : 'border-slate-200/80 bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:border-white/[0.08] dark:bg-[#2a2a2e] dark:text-zinc-300 dark:hover:bg-[#333338] dark:hover:text-white'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5.5 2.5v1.8M2.5 5.5h1.8M3.4 3.4l1.3 1.3M7.6 3.4L6.3 4.7M3.4 7.6l1.3-1.3" />
                <path d="M6.8 6.8l6.2 2.3-2.5 1.2-1.2 2.5-2.5-6z" />
              </svg>
            </button>
            <span className="h-4 w-px bg-zinc-200 dark:bg-white/10 mx-0.5" aria-hidden="true" />
          </>
        )}

        {linkedTextNodes.map((item, idx) => {
          const token = `@文本${idx + 1}`;
          return (
            <div
              key={item.id}
              onMouseEnter={() => dispatchHighlightNode(item.id)}
              onMouseLeave={() => dispatchHighlightNode(null)}
              className="group/text relative flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-zinc-200 bg-zinc-100 text-zinc-700 transition-colors hover:border-indigo-400 dark:border-white/[0.08] dark:bg-[#222226] dark:text-zinc-300"
            >
              <span
                aria-hidden="true"
                className="canvas-reference-badge"
              >
                文本{idx + 1}
              </span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertTextRef(token)}
                title={`点击插入 ${token}（${item.content?.trim() || '未填写'}）`}
                className="flex h-full w-full items-center justify-center rounded-[9px] text-left text-[11px] font-medium cursor-pointer"
              >
                <AlignLeft size={15} className="shrink-0 text-zinc-700 dark:text-zinc-300" />
                <span className="sr-only">{token} · {item.title || '文本'}</span>
              </button>
              {onToggleUpstreamTextPreview && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleUpstreamTextPreview();
                  }}
                  title={showUpstreamTextPreview ? '收起上游文本预览' : '查看上游文本内容'}
                  className={`absolute bottom-0.5 right-0.5 z-10 rounded p-0.5 transition-colors cursor-pointer ${
                    showUpstreamTextPreview
                      ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300'
                      : 'text-zinc-400 opacity-0 group-hover/text:opacity-100 hover:text-zinc-700 dark:hover:text-white'
                  }`}
                >
                  <Eye size={10} />
                </button>
              )}
              <button
                type="button"
                aria-label={`断开 ${item.title || '提示词'}`}
                onClick={() => {
                  dispatchHighlightNode(null);
                  onDisconnectTextNode(item.id);
                }}
                className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black/85 text-white opacity-0 shadow-xs transition-opacity group-hover/text:opacity-100 focus:opacity-100 cursor-pointer"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          );
        })}

        {refs.map((url, index) => {
          const sourceNode = findSourceNodeForUrl(url);
          const sourceNodeId = sourceNode?.id || null;
          const refLabel = referenceNames[index] || `图片${index + 1}`;
          const roleBadge =
            isFirstLastMode && index === 0
              ? '首帧'
              : isFirstLastMode && index === 1 && videoMode === 'first_last_frame'
                ? '尾帧'
                : isVideo && videoMode === 'last_frame' && index === 0
                  ? '尾帧'
                  : isVideo && videoMode === 'motion_control' && index === 0
                    ? '人物'
                    : isVideo && videoMode === 'motion_control' && index === 1
                      ? '动作'
                      : null;

          return (
            <div
              key={`${url}-${index}`}
              data-image-reorder-thumb="true"
              draggable={refs.length > 1}
              onDragStart={(e) => {
                setDragFromIndex(index);
                setHoverPreview(null);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (dragFromIndex === null || dragFromIndex === index) return;
                e.preventDefault();
                setDragOverIndex(index);
              }}
              onDragLeave={() => {
                if (dragOverIndex === index) setDragOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFromIndex !== null && dragFromIndex !== index) {
                  handleReorder(dragFromIndex, index);
                }
                setDragFromIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDragFromIndex(null);
                setDragOverIndex(null);
              }}
              onMouseEnter={(e) => {
                if (sourceNodeId) dispatchHighlightNode(sourceNodeId);
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverPreview({
                  url,
                  label: `@${refLabel}`,
                  sourceTitle: sourceNode?.title,
                  left: rect.left + rect.width / 2,
                  top: rect.top - 6,
                });
              }}
              onMouseLeave={() => {
                dispatchHighlightNode(null);
                setHoverPreview((curr) => (curr?.url === url ? null : curr));
              }}
              className={`group/frame relative size-11 shrink-0 select-none rounded-[12px] border transition-all ${
                dragFromIndex === index ? 'opacity-45 scale-95' : ''
              } ${
                dragOverIndex === index
                  ? 'ring-2 ring-sky-400 border-sky-400'
                  : 'border-zinc-200 bg-zinc-100 dark:border-white/10 dark:bg-[#1f1f1f]'
              }`}
            >
              <span
                aria-hidden="true"
                className="canvas-reference-badge"
              >
                {refLabel}
              </span>

              <button
                type="button"
                aria-label={`引用${refLabel}`}
                title={`点击插入 @${refLabel}（可拖拽排序或使用 Alt + ←/→ 调整顺序）`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onInsertMediaRef(index)}
                onKeyDown={(event) => {
                  if (event.altKey && event.key === 'ArrowLeft' && index > 0) {
                    event.preventDefault();
                    onMoveMediaRef(index, -1);
                  } else if (event.altKey && event.key === 'ArrowRight' && index < refs.length - 1) {
                    event.preventDefault();
                    onMoveMediaRef(index, 1);
                  }
                }}
                className="relative block h-full w-full overflow-hidden rounded-[9px] focus-visible:outline-2 focus-visible:outline-indigo-400 cursor-pointer"
              >
                {isVideoMediaUrl(url) ? (
                  <video src={proxyMediaUrl(url)} muted preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  <img
                    src={proxyMediaUrl(url, { thumb: true, width: 120 })}
                    alt={`参考图 ${index + 1}`}
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                )}
                {roleBadge && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center text-[8px] font-medium leading-none text-white truncate">
                    {roleBadge}
                  </span>
                )}
              </button>

              {refs.length > 1 && (
                <div className="absolute -bottom-1.5 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-0.5 rounded-full bg-zinc-900/90 px-1 py-0.5 text-white shadow-md group-hover/frame:flex">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveMediaRef(index, -1);
                    }}
                    title="前移顺位"
                    className="disabled:opacity-30 hover:text-sky-300 cursor-pointer"
                  >
                    <ChevronLeft size={9} />
                  </button>
                  <button
                    type="button"
                    disabled={index === refs.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveMediaRef(index, 1);
                    }}
                    title="后移顺位"
                    className="disabled:opacity-30 hover:text-sky-300 cursor-pointer"
                  >
                    <ChevronRight size={9} />
                  </button>
                </div>
              )}

              <button
                type="button"
                aria-label={`移除${refLabel}`}
                onClick={() => {
                  dispatchHighlightNode(null);
                  setHoverPreview(null);
                  onRemoveMediaRef(url);
                }}
                className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-black text-white opacity-0 transition-opacity group-hover/frame:opacity-100 focus:opacity-100 cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          data-canvas-reference-picker-button="true"
          aria-label="添加参考素材"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          title="上传或添加参考素材"
          className="flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-slate-200/80 dark:border-white/[0.08] bg-slate-100 dark:bg-[#2a2a2e] text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-[#333338] hover:text-slate-900 dark:hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={17} />}
        </button>

        {isFirstLastMode && refs.length >= 2 && (
          <button
            type="button"
            onClick={onSwapFirstLast}
            title="互换首帧与尾帧顺序"
            className="flex h-7 items-center gap-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] px-2 text-[11px] font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ArrowLeftRight size={11} />
            <span>首尾互换</span>
          </button>
        )}

        {rightSlot ? <div className="ml-auto flex shrink-0 items-center">{rightSlot}</div> : null}
      </div>

      {/* 悬停 100px 浮层大图预览 Portal（与参考程序 jpr / data-reference-strip-hover-preview 1:1 对齐） */}
      {hoverPreview &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-reference-strip-hover-preview="true"
            style={{
              left: hoverPreview.left,
              top: hoverPreview.top,
              transform: 'translate(-50%, -100%)',
            }}
            className="pointer-events-none fixed z-[10000] overflow-hidden rounded-[12px] bg-black shadow-[0px_8px_24px_rgba(0,0,0,0.5)]"
          >
            <div className="relative h-[100px] min-w-[72px] max-w-[180px] overflow-hidden rounded-[12px]">
              {isVideoMediaUrl(hoverPreview.url) ? (
                <video src={proxyMediaUrl(hoverPreview.url)} muted preload="metadata" className="block h-[100px] w-auto object-cover" />
              ) : (
                <img
                  src={proxyMediaUrl(hoverPreview.url, { thumb: true, width: 240 })}
                  alt=""
                  className="block h-[100px] w-auto object-cover"
                />
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-1.5 pb-1 pt-3">
                <div className="truncate font-mono text-[10px] leading-tight text-white">
                  {hoverPreview.label}
                  {hoverPreview.sourceTitle ? ` · ${hoverPreview.sourceTitle}` : ''}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
