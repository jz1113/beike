import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Copy01Icon,
  FileAudioIcon,
  File01Icon,
  Film01Icon,
  Presentation01Icon,
  StopIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { useAppStore, type GenerationTask } from '@client/store';
import GenerationBatchPanel from '@client/shared/agent/GenerationBatchPanel';
import GenerationPromptCodeBlock from '@client/shared/agent/GenerationPromptCodeBlock';
import { agentPromptSource } from '@client/shared/agent/generationBatchSources';
import { apiFetch } from '@client/shared/api/apiClient';
import ThoughtLine from '@client/shared/ui/ThoughtLine';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import type { ApprovalRequestItem, AssistantItem } from '@shared/domain/assistant/types';
import { stopAgentTask } from '../engine/submitAgentTask';
import { parseAgentAttachments, visibleAgentPrompt, type ParsedAttachment } from '@client/shared/media/agentArtifact';
import { presentAgentTurn } from '../model/agentToolActivity';
import AgentToolActivity from './AgentToolActivity';

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

function usedModelName(task: GenerationTask): string {
  const id = task.agentTurn?.modelUsed || task.model || '';
  if (!id) return '';
  return getApprovedModel(id)?.shortName || id;
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
    return (
      <div className="flex h-20 w-28 flex-col items-center justify-center rounded-xl border border-black/10 bg-slate-900 text-white shadow-2xs dark:bg-white dark:text-slate-950">
        <HugeiconsIcon icon={Film01Icon} size={22} className="text-cyan-400" />
        <span className="mt-1 max-w-[90%] truncate text-[10px] text-slate-300">{item.name}</span>
      </div>
    );
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
  const modelName = usedModelName(task);

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
    <div className="w-full max-w-3xl space-y-6 py-2 select-text">
      <div className="flex flex-col items-end gap-2.5">
        {attachments.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {attachments.map((item, idx) => (
              <AttachmentPill key={`${item.url}-${idx}`} item={item} />
            ))}
          </div>
        )}
        {(prompt || attachments.length === 0) && (
          <div className="max-w-[80%] rounded-2xl bg-[#F2F3F5] px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-slate-900 shadow-2xs select-text dark:bg-white/10 dark:text-slate-100">
            {prompt || '（多模态素材解析）'}
          </div>
        )}
      </div>

      <div className="space-y-3 pr-4">
        {writing && items.length === 0 && (
          <ThoughtLine label={statusText || '正在思考…'} working collapseOnSettle={false} collapsible={false} fontSize={13.5} className="text-slate-600 dark:text-slate-300" />
        )}

        <AnimatePresence initial={false}>
          {blocks.map((block) => {
            if (block.kind === 'tools') return <AgentToolActivity key={block.group.id} group={block.group} />;
            const item = block.item;
            const index = items.findIndex((entry) => entry.id === item.id);
            if (item.kind === 'agentReasoning') {
              const stillThinking = writing && !items.slice(index + 1).some((later) => later.kind === 'agentMessage' && later.content);
              return (
                <ThoughtLine
                  key={item.id}
                  label="正在思考…"
                  doneLabel="已深度思考"
                  working={stillThinking}
                  collapseOnSettle
                  fontSize={13.5}
                  className="text-slate-700 dark:text-slate-200"
                >
                  {item.content ? (
                    <p className="mt-2 max-h-60 overflow-y-auto font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-slate-600 select-text dark:text-slate-300">{item.content}</p>
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
              const streaming = writing && index === items.findLastIndex((entry) => entry.kind === 'agentMessage');
              return <MarkdownBody key={item.id} content={message.content} accentColor="slate" streaming={streaming} renderCode={renderCode} />;
            }
            return null;
          })}
        </AnimatePresence>

        {!itemReply && reply ? <MarkdownBody content={reply} accentColor="slate" streaming={writing} renderCode={renderCode} /> : null}
        <GenerationBatchPanel key={source.sourceId} source={source} disabled={writing || task.status !== 'SUCCESS'} />

        {task.agentTurn?.generationNotice && <p role="status" className="text-xs leading-6 text-slate-500">{task.agentTurn.generationNotice}</p>}
        {failure ? <p className="text-sm leading-6 text-rose-600 dark:text-rose-400">{failure}</p> : null}

        <div className="flex items-center gap-2.5 pt-0.5 text-xs text-slate-400 dark:text-slate-500">
          {writing ? (
            <button
              type="button"
              aria-label="停止"
              title="停止"
              onClick={() => stopAgentTask(task.id)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <HugeiconsIcon icon={StopIcon} size={14} />
            </button>
          ) : (
            <>
              <button
                type="button"
                aria-label="复制回答"
                title="复制回答"
                onClick={() => void copyReply()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={14} className={copied ? 'text-emerald-600' : ''} />
              </button>
              <button
                type="button"
                aria-label="重新生成"
                title="重新生成"
                onClick={() => onRegenerate(task)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="删除"
                title="删除"
                onClick={() => onDelete(task)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-400/10 dark:hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {stamp ? <span>{stamp}</span> : null}
          {modelName ? <span className="truncate">{modelName}</span> : null}
        </div>
      </div>
    </div>
  );
}
