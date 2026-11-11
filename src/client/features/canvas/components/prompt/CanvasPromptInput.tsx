import { forwardRef, type ReactNode, useId, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { RichPromptInput, type RichPromptInputRef, type SubjectItem } from '@client/shared/prompt-bar/RichPromptInput';
import { formatMentionDisplayLabel } from '@client/shared/prompt-bar/promptMentionDom';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { mediaReferenceSlots } from '@client/shared/media/videoReferences';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { canvasMediaKind, persistCanvasMedia } from '../../model/canvasNodeFactory';
import type { CanvasNode } from '../../model/types';
import { useCanvasStore } from '../../store/useCanvasStore';
import { AlignLeft, AudioLines, ChevronRight, FileText, Folder, Image as ImageIcon, Search, Video } from 'lucide-react';

export function CanvasPromptReferenceThumbnail({ url, poster, isVideo }: { url: string; poster?: string; isVideo: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const className = 'pointer-events-none block h-full w-full object-cover';
  return (
    <span className="relative block h-full w-full text-slate-500 dark:text-zinc-300">
      {failedUrl === url ? (
        <span className="flex h-full items-center justify-center">
          {isVideo ? <Video size={15} /> : <ImageIcon size={15} />}
        </span>
      ) : isVideo ? (
        <>
          <video className={className} src={proxyMediaUrl(url, { asVideo: true })} poster={poster && proxyMediaUrl(poster)} preload={poster ? 'metadata' : 'auto'} muted playsInline onError={() => setFailedUrl(url)} />
          <Video size={12} className="absolute bottom-0.5 right-0.5 rounded bg-black/75 p-px text-white" />
        </>
      ) : (
        <img className={className} src={proxyMediaUrl(url, { thumb: true, width: 88 })} alt="" onError={() => setFailedUrl(url)} />
      )}
    </span>
  );
}

export async function uploadCanvasPromptReferences(projectId: string, target: CanvasNode, files: File[]) {
  const settings = target.studioRaw?.settings as Record<string, unknown> | undefined;
  if (settings?.beikeTextResultRequired === true && settings.beikeStoryboardSceneSourceId && files.some(file => canvasMediaKind(file) === 'video')) {
    throw new Error('05逐镜分析只接受01原片，请在01节点替换视频');
  }
  for (const [index, file] of files.entries()) {
    const media = await persistCanvasMedia(file, target.x - 170, target.y + 100 + index * 180);
    const state = useCanvasStore.getState();
    if (!state.projects.find(project => project.id === projectId)?.nodes.some(node => node.id === target.id)) return;
    const id = `node-${crypto.randomUUID()}`;
    state.addNode(projectId, { ...media, x: Math.max(24, media.x), id, mediaUpload: true, status: 'success', createdAt: Date.now() });
    state.addEdge(projectId, { sourceNodeId: id, targetNodeId: target.id });
  }
}

export interface CanvasTextRefOption {
  id: string;
  token: string;
  title: string;
}

export interface CanvasMentionCandidate {
  nodeId: string;
  isText: boolean;
  isVideo?: boolean;
  title: string;
  url?: string;
}

export interface CanvasPromptInputRef {
  insertReference: (index: number) => void;
  insertToken: (token: string) => void;
  focus?: () => void;
}

export const CanvasPromptInput = forwardRef<
  CanvasPromptInputRef,
  {
    ariaLabel?: string;
    value: string;
    references: string[];
    referenceTitles?: (string | undefined)[];
    referenceVideoFlags?: boolean[];
    mixedReferenceOrder?: boolean;
    referenceNodeIds?: string[];
    textReferences?: CanvasTextRefOption[];
    canvasCandidates?: CanvasMentionCandidate[];
    expanded?: boolean;
    disabled?: boolean;
    placeholder?: string;
    leadingSlot?: ReactNode;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onConnectCandidate?: (candidate: CanvasMentionCandidate) => void;
    onRequestUpload?: () => void;
  }
>(function CanvasPromptInput(
  {
    ariaLabel = '生成提示词',
    value,
    references,
    referenceTitles = [],
    referenceVideoFlags,
    mixedReferenceOrder = false,
    referenceNodeIds,
    textReferences = [],
    canvasCandidates = [],
    expanded = false,
    disabled = false,
    placeholder,
    leadingSlot,
    onChange,
    onSubmit,
    onConnectCandidate,
    onRequestUpload,
  },
  ref,
) {
  const input = useRef<RichPromptInputRef>(null);
  const root = useRef<HTMLDivElement>(null);
  const [menuTop, setMenuTop] = useState(28);
  const listId = useId();
  const [mention, setMention] = useState<{ query: string } | null>(null);
  const [active, setActive] = useState(0);

  const slots = useMemo(() => mediaReferenceSlots(references, referenceVideoFlags, mixedReferenceOrder), [references, referenceVideoFlags, mixedReferenceOrder]);

  const allSubjects = useMemo<SubjectItem[]>(() => {
    const items: SubjectItem[] = [];
    slots.forEach((slot, idx) => {
      items.push({ id: referenceNodeIds?.[idx] ? `canvas-node:${referenceNodeIds[idx]}` : `canvas-ref-${idx}`, name: slot.name, url: slot.url });
      const rawTitle = referenceTitles[idx]?.trim();
      if (rawTitle && rawTitle !== slot.name) {
        items.push({ id: rawTitle, name: slot.name, url: slot.url });
      }
    });
    textReferences.forEach((t, idx) => {
      const cleanName = t.token.replace(/^@/, '');
      items.push({ id: `text-ref-${idx}`, name: cleanName, url: `text:${t.id}` });
      const rawTitle = t.title?.trim();
      if (rawTitle && rawTitle !== cleanName) {
        items.push({ id: rawTitle, name: cleanName, url: `text:${t.id}` });
      }
    });
    return items;
  }, [slots, referenceTitles, textReferences, referenceNodeIds]);

  const queryLower = (mention?.query || '').trim().toLowerCase();

  const mediaChoices = slots
    .map((item, idx) => {
      const displayName = formatMentionDisplayLabel(item.name);
      return {
        kind: 'media' as const,
        key: `media-${idx}`,
        name: item.name,
        isVideo: item.name.startsWith('视频'),
        label: displayName,
        badge: displayName,
        url: item.url,
        index: idx,
      };
    })
    .filter(
      (item) =>
        !queryLower ||
        item.name.toLowerCase().includes(queryLower) ||
        item.label.toLowerCase().includes(queryLower) ||
        item.badge.toLowerCase().includes(queryLower),
    );

  const textChoices = textReferences
    .map((t, idx) => {
      const cleanName = t.token.replace(/^@/, '');
      const displayName = formatMentionDisplayLabel(cleanName);
      return {
        kind: 'text' as const,
        key: `text-${t.id}`,
        name: cleanName,
        label: displayName,
        badge: displayName,
        token: t.token,
        id: t.id,
        index: idx,
      };
    })
    .filter(
      (item) =>
        !queryLower ||
        item.label.toLowerCase().includes(queryLower) ||
        item.badge.toLowerCase().includes(queryLower),
    );

  const candidateChoices = canvasCandidates
    .map((c, idx) => {
      const nextImgCount = (mixedReferenceOrder ? slots.length : slots.filter((s) => s.name.startsWith('图片')).length) + 1;
      const nextVidCount = (mixedReferenceOrder ? slots.length : slots.filter((s) => s.name.startsWith('视频')).length) + 1;
      const nextTxtCount = textReferences.length + 1;
      const targetName = c.isText
        ? `文本${nextTxtCount}`
        : (c.isVideo ?? isVideoMediaUrl(c.url))
          ? `视频${nextVidCount}`
          : `图片${nextImgCount}`;
      const displayName = formatMentionDisplayLabel(targetName);
      return {
        kind: 'candidate' as const,
        key: `cand-${c.nodeId}-${idx}`,
        candidate: c,
        isVideo: targetName.startsWith('视频'),
        name: targetName,
        label: displayName,
        badge: displayName,
        url: c.url,
      };
    })
    .filter(
      (item) =>
        !queryLower ||
        item.label.toLowerCase().includes(queryLower) ||
        item.badge.toLowerCase().includes(queryLower),
    );

  const connectedChoices = [...mediaChoices, ...textChoices];
  const allChoices = connectedChoices.length > 0 ? connectedChoices : candidateChoices;

  const insertMediaByName = (name: string) => {
    const index = slots.findIndex((item) => item.name === name);
    if (index < 0) return;
    input.current?.insertMention({ id: referenceNodeIds?.[index] ? `canvas-node:${referenceNodeIds[index]}` : `canvas-ref-${index}`, name, url: references[index] });
    setMention(null);
  };

  const insertTextRef = (token: string, id?: string, idx = 0) => {
    const cleanName = token.replace(/^@/, '');
    input.current?.insertMention({
      id: `text-ref-${idx}`,
      name: cleanName,
      url: `text:${id || cleanName}`,
    });
    setMention(null);
  };

  const insertCandidateChoice = (item: (typeof candidateChoices)[number]) => {
    onConnectCandidate?.(item.candidate);
    if (item.candidate.isText) {
      input.current?.insertMention({
        id: `text-ref-${textReferences.length}`,
        name: item.name,
        url: `text:${item.candidate.nodeId}`,
      });
    } else if (item.url) {
      input.current?.insertMention({
        id: referenceNodeIds ? `canvas-node:${item.candidate.nodeId}` : `canvas-ref-${slots.length}`,
        name: item.name,
        url: item.url,
      });
    }
    setMention(null);
  };

  useImperativeHandle(ref, () => ({
    insertReference: (index: number) => {
      if (slots[index]) insertMediaByName(slots[index].name);
    },
    insertToken: (token: string) => {
      const matched = textReferences.findIndex(
        (t) => t.token === token || t.token.replace(/^@/, '') === token.replace(/^@/, ''),
      );
      insertTextRef(token, matched >= 0 ? textReferences[matched].id : undefined, Math.max(0, matched));
    },
    focus: () => input.current?.focus(),
  }));

  const categoryRows = [
    { key: '图片', label: '图片', icon: ImageIcon, hasArrow: true },
    { key: '视频', label: '视频', icon: Video, hasArrow: true },
    { key: '音频', label: '音频', icon: AudioLines, hasArrow: true },
    { key: '文本', label: '文本', icon: FileText, hasArrow: true },
    { key: '资产', label: '资产', icon: Folder, hasArrow: false },
  ] as const;

  return (
    <div
      ref={root}
      className={`relative mt-2 mb-2 ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMention(null);
      }}
    >
      <div className="flex items-start gap-2">
        {leadingSlot}
        <div className={`min-w-0 flex-1 overflow-y-auto no-scrollbar transition-[min-height,max-height] duration-150 ${
          expanded ? 'min-h-[180px] max-h-[340px]' : 'min-h-[78px] max-h-[140px]'
        }`}>
          <RichPromptInput
            ariaLabel={ariaLabel}
            ref={input}
            value={value}
            onChange={onChange}
            allSubjects={allSubjects}
            quickRefImages={references}
            placeholder={
              placeholder ||
              (textReferences.length > 0 && !value.trim()
                ? '@'
                : '描述任何你想要生成的内容；输入 @ 打开我的资产库')
            }
            variant="composer"
            onTriggerAtMenu={(_, query = '') => {
              const container = root.current;
              const selection = window.getSelection();
              if (container && selection?.rangeCount && container.contains(selection.anchorNode)) {
                const rect = container.getBoundingClientRect();
                const caret = selection.getRangeAt(0).getBoundingClientRect?.();
                const scale = container.offsetHeight ? rect.height / container.offsetHeight : 1;
                setMenuTop(caret && caret.height && scale > 0 ? (caret.bottom - rect.top) / scale + 8 : 28);
              }
              setMention({ query });
              setActive(0);
            }}
            onCloseAtMenu={() => setMention(null)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (mention) {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setMention(null);
                  return;
                }
                if (allChoices.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
                  event.preventDefault();
                  setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : allChoices.length - 1)) % allChoices.length);
                  return;
                }
                if (allChoices.length && ['Enter', 'Tab'].includes(event.key)) {
                  event.preventDefault();
                  const chosen = allChoices[Math.min(active, allChoices.length - 1)];
                  if (chosen.kind === 'media') insertMediaByName(chosen.name);
                  else if (chosen.kind === 'text') insertTextRef(chosen.token, chosen.id, chosen.index);
                  else insertCandidateChoice(chosen);
                  return;
                }
              }
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
        </div>
      </div>

      {mention && (
        <div
          id={listId}
          role="listbox"
          aria-label="引用参考图片"
          style={{ top: menuTop }}
          className="absolute left-0 z-[180] w-56 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.12] bg-white dark:bg-[#1e1e22] p-2 shadow-lg dark:shadow-[0_18px_48px_rgba(0,0,0,0.8)] text-slate-700 dark:text-[#E4E4E7]"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-[#141417] px-2.5 py-1.5 text-xs text-slate-700 dark:text-zinc-200">
            <Search size={13} className="shrink-0 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              value={mention.query}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                setMention({ query: e.target.value });
                setActive(0);
              }}
              placeholder="搜索"
              className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400 dark:placeholder:text-zinc-500"
            />
          </div>

          <div className="px-2 py-1 text-[11px] font-medium text-slate-400 dark:text-zinc-400">已引用</div>
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {allChoices.map((item, index) => (
              <button
                key={item.key}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={index === Math.min(active, allChoices.length - 1)}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  if (item.kind === 'media') insertMediaByName(item.name);
                  else if (item.kind === 'text') insertTextRef(item.token, item.id, item.index);
                  else insertCandidateChoice(item);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                  index === Math.min(active, allChoices.length - 1)
                    ? 'bg-slate-100 dark:bg-white/[0.1] text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-white/[0.06]'
                }`}
              >
                {item.kind === 'media' || (item.kind === 'candidate' && !item.candidate.isText) ? (
                  item.isVideo ? (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-white/10">▶</span>
                  ) : item.url ? (
                    <img src={proxyMediaUrl(item.url, { thumb: true, width: 80 })} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-[#2a2a2e] text-slate-600 dark:text-zinc-200">
                      <AlignLeft size={13} />
                    </span>
                  )
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 dark:bg-[#2a2a2e] text-slate-600 dark:text-zinc-200">
                    <AlignLeft size={13} />
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>

          {!allChoices.length && (
            <p className="px-2 py-2 text-xs text-slate-500 dark:text-zinc-500">
              {references.length || textReferences.length ? '没有匹配的参考素材' : '先连接或添加参考素材，再用 @ 引用'}
            </p>
          )}

          <div className="mt-1.5 border-t border-slate-100 dark:border-white/[0.08] pt-1.5">
            <div className="px-2 py-1 text-[11px] font-medium text-slate-400 dark:text-zinc-400">素材引用</div>
            {categoryRows.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    if ((cat.key === '图片' || cat.key === '视频') && onRequestUpload) {
                      setMention(null);
                      onRequestUpload();
                      return;
                    }
                    setMention({ query: cat.key === '文本' ? '文本' : cat.key === '图片' ? '图片' : cat.key === '视频' ? '视频' : '' });
                    setActive(0);
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:text-zinc-200 dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon size={14} className="text-slate-400 dark:text-zinc-400" />
                    <span>{cat.label}</span>
                  </span>
                  {cat.hasArrow && <ChevronRight size={13} className="text-slate-400 dark:text-zinc-500" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
