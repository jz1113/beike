import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, FileText, Film, Image, Link, ListChecks, LoaderCircle, Play, RotateCcw, Search, Terminal, Trash2, Wrench, X } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Copy01Icon,
  FileAudioIcon,
  File01Icon,
  Presentation01Icon,
  StopIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { useAppStore, type GenerationTask } from '@client/store';
import GenerationBatchPanel from '@client/shared/agent/GenerationBatchPanel';
import ProductCardWidget from '@client/shared/agent/ProductCardWidget';
import { readAgentTurnSnapshot } from '../engine/recoverAgentTurn';
import GenerationPromptCodeBlock from '@client/shared/agent/GenerationPromptCodeBlock';
import { agentPromptSource } from '@client/shared/agent/generationBatchSources';
import { apiFetch, proxyMediaUrl } from '@client/shared/api/apiClient';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import ThoughtLine from '@client/shared/ui/ThoughtLine';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import { modalityPickerSelections } from '@shared/domain/models/modalityStorage';
import { selectedTextModel } from '@shared/domain/models/workflowModelStorage';
import type { ApprovalRequestItem, AssistantItem } from '@shared/domain/assistant/types';
import { stopAgentTask } from '../engine/submitAgentTask';
import { parseAgentAttachments, visibleAgentPrompt, type ParsedAttachment } from '@client/shared/media/agentArtifact';
import { presentAgentTurn, type ToolActivityGroup, type ToolActivityIcon, type ToolActivityLine } from '../model/agentToolActivity';

export function agentModelName(task: Pick<GenerationTask, 'model' | 'modelRouteKey' | 'agentTurn'>): string {
  const reported = task.agentTurn?.modelUsed;
  const selection = task.modelRouteKey || task.model;
  const options = modalityPickerSelections('chat') || [];
  const entry = options.find(item => item.entryId === selection || item.id === selection);
  if (entry && (!reported || reported === selection || reported === entry.modelId)) return entry.name;

  // The server reports an upstream model, which can be shared by several channels.
  const id = reported || task.model || selection;
  if (!id) return '';
  const modelId = selectedTextModel(id).modelId;
  if (modelId.startsWith('chat_sync_')) return '';
  return getApprovedModel(modelId)?.shortName || modelId;
}

const ICONS: Record<ToolActivityIcon, typeof Wrench> = {
  plan: ListChecks,
  file: FileText,
  search: Search,
  code: Terminal,
  image: Image,
  link: Link,
  tool: Wrench,
};

function toneClass(tone: ToolActivityLine['tone']): string {
  if (tone === 'running') return 'text-slate-500 dark:text-slate-400';
  if (tone === 'error') return 'text-rose-700/80 dark:text-rose-300/80';
  return 'text-[#8b919a] dark:text-slate-500';
}

function ActivityIcon({ icon }: { icon: ToolActivityIcon }) {
  const Icon = ICONS[icon];
  return <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />;
}

function AgentToolActivity({ group }: { group: ToolActivityGroup }) {
  const [open, setOpen] = useState(false);
  const tone = toneClass(group.tone);
  const summary = (
    <span className={group.tone === 'running' ? 'animate-pulse' : undefined}>{group.summary}</span>
  );

  if (!group.expandable) {
    const line = group.lines[0];
    return (
      <div className={`flex items-center gap-1.5 py-0.5 text-[13px] leading-5 ${tone}`}>
        <ActivityIcon icon={line?.icon || 'tool'} />
        {summary}
      </div>
    );
  }

  return (
    <div className={`py-0.5 text-[13px] leading-5 ${tone}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-full items-center gap-1 text-left hover:text-slate-600 dark:hover:text-slate-300"
      >
        <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} strokeWidth={1.6} />
        {summary}
      </button>
      {open && (
        <div className="ml-[7px] mt-0.5 space-y-0.5 border-l border-slate-200/80 pl-3 dark:border-white/10">
          {group.lines.map((line) => (
            <div key={line.id} className={toneClass(line.tone)}>
              <div className="flex min-w-0 items-center gap-1.5 py-0.5">
                <ActivityIcon icon={line.icon} />
                <span className="min-w-0 truncate">{line.text}</span>
              </div>
              {line.details.map((detail, index) => (
                <p key={`${line.id}-${index}`} className="pl-5 text-[12px] leading-5 whitespace-normal text-slate-400 dark:text-slate-500">{detail}</p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Match the compact reference-image tile; playback opens only on request. */
function AgentVideoAttachment({ item }: { item: ParsedAttachment }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useModalDialog(open, () => setOpen(false));
  const src = proxyMediaUrl(item.url, { asVideo: true });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={`播放视频：${item.name}`}
        aria-label={`播放视频：${item.name}`}
        className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-black/5 shadow-2xs focus-visible:outline-2 focus-visible:outline-slate-400 dark:border-white/10 dark:bg-white/5">
        {!failed && (
          <video src={src} muted playsInline preload="metadata" aria-hidden="true"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (Number.isFinite(video.duration) && video.duration > 0) {
                video.currentTime = Math.min(0.1, video.duration / 2);
              }
            }}
            onLoadedData={() => setReady(true)}
            onSeeked={() => setReady(true)}
            onError={() => setFailed(true)}
            className="pointer-events-none h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        )}
        {!ready && !failed && <LoaderCircle aria-label="正在加载预览" className="absolute left-7 top-6 h-5 w-5 animate-spin text-slate-400" />}
        {failed && <Film className="absolute left-7 top-5 h-6 w-6 text-slate-400" />}
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Play className="h-5 w-5 fill-white drop-shadow" />
        </span>
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-center text-[10px] text-white backdrop-blur-xs">参考视频</span>
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" onClick={() => setOpen(false)}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`视频预览：${item.name}`} tabIndex={-1}
            className="relative flex max-h-[90vh] w-full max-w-4xl flex-col items-center gap-3" onClick={event => event.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label="关闭视频预览"
              className="self-end rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white">
              <X className="h-5 w-5" />
            </button>
            <video src={src} controls autoPlay playsInline preload="auto" aria-label={item.name}
              className="max-h-[75vh] w-full rounded-xl bg-black object-contain" />
            <span className="max-w-full truncate text-xs text-slate-300" title={item.name}>{item.name}</span>
          </div>
        </div>, document.body,
      )}
    </>
  );
}

const EMPTY_ITEMS: AssistantItem[] = [];
const EMPTY_TASKS: GenerationTask[] = [];

interface Props {
  task: GenerationTask;
  onRegenerate: (task: GenerationTask) => void;
  onDelete: (task: GenerationTask) => void;
}

function relativeTime(createdAt: number | undefined, now: number): string {
  if (!createdAt) return '';
  const minutes = Math.floor(Math.max(0, now - createdAt) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function AttachmentPill({ item }: { item: ParsedAttachment }) {
  if (item.kind === 'image') {
    return (
      <div className="group relative overflow-hidden rounded-xl border border-black/10 bg-black/5 shadow-2xs">
        <img src={item.url} alt={item.name} className="h-20 w-20 object-cover transition-transform group-hover:scale-105" />
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-center text-[10px] text-white backdrop-blur-xs">参考图</span>
      </div>
    );
  }
  if (item.kind === 'video') {
    return <AgentVideoAttachment key={item.url} item={item} />;
  }
  const icon = item.kind === 'audio' ? FileAudioIcon : item.kind === 'ppt' ? Presentation01Icon : File01Icon;
  return (
    <div className="inline-flex max-w-[260px] items-center gap-2 rounded-xl border border-black/10 bg-white/90 px-3 py-2 shadow-2xs dark:border-white/10 dark:bg-white/10">
      <HugeiconsIcon icon={icon} size={16} className="shrink-0 text-slate-600 dark:text-slate-200" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{item.name}</p>
        <p className="text-[10px] text-slate-400">
          {item.kind.toUpperCase()}
          {item.size ? ` · ${(item.size / 1024).toFixed(1)} KB` : ''}
        </p>
      </div>
    </div>
  );
}

export default function AgentTurn({ task, onRegenerate, onDelete }: Props) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const turnId = task.agentTurn?.turnId || task.taskId;
    const threadId = task.agentTurn?.threadId || task.sessionId;
    if (task.agentTurn?.modelUsed !== 'direct-collection' || task.agentTurn.productWidget || !turnId || !threadId) return;
    const controller = new AbortController();
    void apiFetch(`/api/assistant/turns/${encodeURIComponent(turnId)}/snapshot`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        const snapshot = readAgentTurnSnapshot(data?.snapshot, turnId, threadId);
        if (!snapshot?.productWidget || controller.signal.aborted) return;
        const current = useAppStore.getState().generationTasks.find(item => item.id === task.id);
        if (current && !current.agentTurn?.productWidget) useAppStore.getState().updateGenerationTask(task.id, { agentTurn: { ...current.agentTurn, productWidget: snapshot.productWidget } });
      }).catch(() => {});
    return () => controller.abort();
  }, [task.id, task.taskId, task.sessionId, task.agentTurn?.turnId, task.agentTurn?.threadId, task.agentTurn?.modelUsed, task.agentTurn?.productWidget]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const prompt = visibleAgentPrompt(task.prompt || '');
  const attachments = parseAgentAttachments(task);
  const writing = task.status === 'IN_PROGRESS';
  const items = task.agentTurn?.items ?? EMPTY_ITEMS;
  const itemReply = items
    .filter((item): item is Extract<AssistantItem, { kind: 'agentMessage' }> => item.kind === 'agentMessage' && Boolean(item.content?.trim()))
    .map((item) => item.content.trim())
    .join('\n\n');
  const reply = itemReply || task.agentTurn?.reply?.trim() || '';
  const statusText = task.agentTurn?.statusText?.trim();
  const failure = task.status === 'FAILURE' ? task.failReason : '';
  const stamp = relativeTime(task.createdAt, now);
  const modelName = agentModelName(task);

  const copyReply = async () => {
    try {
      await navigator.clipboard.writeText(reply || failure || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const decide = async (approval: ApprovalRequestItem, decision: 'accept' | 'decline') => {
    const turnId = task.agentTurn?.turnId || task.taskId;
    if (!turnId) return;
    await apiFetch('/api/assistant/turn/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnId, approvalId: approval.approvalId, decision }),
    }).catch(() => undefined);
  };

  const blocks = useMemo(() => presentAgentTurn(items), [items]);
  const sessionTasks = useAppStore(state => state.sessions.find(session => session.id === task.sessionId)?.tasks ?? EMPTY_TASKS);
  const source = useMemo(() => agentPromptSource(sessionTasks, task), [sessionTasks, task]);
  const renderCode = (code: string, lang: string, incomplete: boolean) => <GenerationPromptCodeBlock code={code} lang={lang} incomplete={incomplete} source={source} disabled={writing || task.status !== 'SUCCESS'} />;

  return (
    <div className={`mx-auto w-full ${task.agentTurn?.productWidget ? 'max-w-6xl' : 'max-w-3xl'} space-y-10 py-2 select-text`}>
      <div className="flex flex-col items-end gap-2.5" aria-label="用户消息">
        {attachments.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {attachments.map((item, idx) => (
              <AttachmentPill key={`${item.url}-${idx}`} item={item} />
            ))}
          </div>
        )}
        {(prompt || attachments.length === 0) && (
          <div className="max-w-[80%] rounded-2xl bg-[#EAF3FF] px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-slate-900 select-text dark:bg-[#29292e] dark:text-slate-100">
            {prompt || '（多模态素材解析）'}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-3 py-2" aria-label="Agent 回复">
        {writing && items.length === 0 && (
          <ThoughtLine label={statusText || '正在思考…'} working collapseOnSettle={false} collapsible={false} fontSize={13.5} className="text-slate-600 dark:text-slate-300" />
        )}

        <AnimatePresence initial={false}>
          {blocks.map((block) => {
            if (block.kind === 'tools') return <AgentToolActivity key={block.group.id} group={block.group} />;
            const item = block.item;
            const index = items.findIndex((entry) => entry.id === item.id);
            if (item.kind === 'agentReasoning') {
              const stillThinking = writing && index === items.length - 1;
              return (
                <ThoughtLine
                  key={item.id}
                  label="正在思考…"
                  doneLabel="已深度思考"
                  working={stillThinking}
                  collapseOnSettle
                  fontSize={13.5}
                  className="w-full text-slate-700 dark:text-slate-200"
                >
                  {item.content ? (
                    <p className="mt-2 max-h-60 w-full overflow-y-auto font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-words text-slate-600 select-text dark:text-slate-300">{item.content}</p>
                  ) : null}
                </ThoughtLine>
              );
            }
            if (item.kind === 'approvalRequest') {
              const approval = item as ApprovalRequestItem;
              if (approval.status !== 'pending') return null;
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                  <span>需要确认：{approval.displayName || approval.toolName}</span>
                  <button type="button" className="rounded-lg bg-amber-600 px-2 py-1 text-white" onClick={() => void decide(approval, 'accept')}>允许</button>
                  <button type="button" className="rounded-lg border border-amber-300 px-2 py-1" onClick={() => void decide(approval, 'decline')}>拒绝</button>
                </div>
              );
            }
            if (item.kind === 'agentMessage') {
              const message = item as Extract<AssistantItem, { kind: 'agentMessage' }>;
              if (!message.content?.trim()) return null;
              const streaming = writing && index === items.length - 1;
              return <MarkdownBody key={item.id} content={message.content} accentColor="slate" streaming={streaming} renderCode={renderCode} />;
            }
            return null;
          })}
        </AnimatePresence>

        {!itemReply && reply ? <MarkdownBody content={reply} accentColor="slate" streaming={writing} renderCode={renderCode} /> : null}
        {task.agentTurn?.productWidget && <ProductCardWidget product={task.agentTurn.productWidget} />}
        <GenerationBatchPanel key={source.sourceId} source={source} disabled={writing || task.status !== 'SUCCESS'} />

        {task.agentTurn?.generationNotice && <p role="status" className="text-xs leading-6 text-slate-500 dark:text-slate-300">{task.agentTurn.generationNotice}</p>}
        {failure ? <p className="text-sm leading-6 text-rose-600 dark:text-rose-400">{failure}</p> : null}

        <div className="flex min-w-0 flex-wrap items-center gap-2 pt-1 text-xs text-slate-500 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="回答操作">
          {writing ? (
            <button
              type="button"
              aria-label="停止"
              title="停止"
              onClick={() => stopAgentTask(task.id)}
              className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <HugeiconsIcon aria-hidden="true" icon={StopIcon} size={14} />
              <span>停止回答</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-label="复制回答"
                title="复制回答"
                onClick={() => void copyReply()}
                className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <HugeiconsIcon aria-hidden="true" icon={copied ? Tick02Icon : Copy01Icon} size={14} className={copied ? 'text-emerald-600' : ''} />
                <span aria-live="polite">{copied ? '已复制' : '复制回答'}</span>
              </button>
              <button
                type="button"
                aria-label="重新生成回答"
                title="使用原请求重新生成回答"
                onClick={() => onRegenerate(task)}
                className="inline-flex min-h-9 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                <span>重新生成回答</span>
              </button>
              <button
                type="button"
                aria-label="删除本轮对话"
                title="删除本轮提问与回答"
                onClick={() => onDelete(task)}
                className="ml-1 inline-flex min-h-9 shrink-0 whitespace-nowrap items-center justify-center gap-1.5 rounded-lg px-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
              >
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                <span>删除本轮</span>
              </button>
            </>
          )}
          </div>
          <div className="flex min-w-0 basis-full items-center gap-2 px-2 text-[11px] text-slate-400 dark:text-slate-500 sm:ml-auto sm:basis-auto">
          {stamp ? <span className="shrink-0">{stamp}</span> : null}
          {modelName ? <span className="min-w-0 truncate" title={modelName}>{modelName}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
