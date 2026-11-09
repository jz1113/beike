import { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, Bot, Check, ChevronRight, FileText, Globe, ListChecks, Pause, Search, Terminal, Wrench } from 'lucide-react';
import type { AssistantItem } from '@shared/domain/assistant/types';
import type { AssistantTaskState } from '@shared/domain/assistant/taskPolicy';
import { getShowThinkingPreference, type ToolActivityEntry } from '../../model/assistantTurnTypes';
import { activityEntries, activityStage, activityStateLabel, executionFailed, executionSettledLabel, formatActivityDuration, type ActivityEntry } from '../../model/assistantActivity';
import ThoughtLine from '@client/shared/ui/ThoughtLine';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

/** Reuse the app’s brand asset across the assistant surfaces. */
export function AssistantMark({ className = '' }: { className?: string }) {
  return <img className={`agent-brand-logo ${className}`} src="/app_logo.png" alt="" aria-hidden="true" draggable={false} />;
}

interface ThinkingBlockProps {
  content: string;
  defaultOpen?: boolean;
  isRunning?: boolean;
}

function ThinkingBlock({
  content,
  defaultOpen = false,
  isRunning = false,
}: ThinkingBlockProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!content?.trim() || !getShowThinkingPreference()) return null;

  return (
    <div className="agent-thinking-wrapper my-1.5">
      <ThoughtLine
        label="正在深度思考…"
        doneLabel="已深度思考"
        working={isRunning}
        collapseOnSettle={!defaultOpen}
        open={open}
        onOpenChange={setOpen}
        fontSize={12}
        className="w-full text-slate-500 dark:text-slate-400"
      >
        <div className="agent-thinking-content mt-1.5 p-2.5 rounded-lg border border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-black/30 font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap select-text">
          {content}
        </div>
      </ThoughtLine>
    </div>
  );
}

/** Supplemental reference context, shown only inside the execution disclosure. */
function AssistantTaskCard({ task }: { task: AssistantTaskState }) {
  return (
    <details className="agent-task-context" data-testid="assistant-task-card">
      <summary>
        任务与参考{task.references.length > 0 ? ` · ${task.references.length} 张图片` : ''}
      </summary>
      <p>{task.goal}</p>
      {task.totalReferences > 0 && (
        <p>
          本轮引用 {task.references.length} / {task.totalReferences} 张
          {task.referenceScope === 'sample'
            ? ' · 按来源抽样，不代表已看完图集'
            : task.referenceScope === 'explicit'
              ? ' · 用户指定编号'
              : ''}
        </p>
      )}
      {task.references.length > 0 && (
        <div className="agent-activity-images">
          {task.references.map((ref) => (
            <a
              key={ref.number}
              href={proxyMediaUrl(ref.url)}
              target="_blank"
              rel="noreferrer"
              title={`${ref.label} · @图片${ref.number}`}
            >
              <img src={proxyMediaUrl(ref.url)} alt={`@图片${ref.number} ${ref.label}`} />
            </a>
          ))}
        </div>
      )}
    </details>
  );
}

interface Props {
  items?: AssistantItem[];
  legacy?: ToolActivityEntry[];
  thinking?: string;
  task?: AssistantTaskState;
  isSending?: boolean;
  active?: boolean;
  startedAt?: number;
  message?: string;
  awaitingApproval?: boolean;
}

function ActivityIcon({ entry }: { entry: ActivityEntry }) {
  const Icon =
    entry.status === 'error'
      ? AlertCircle
      : entry.status === 'interrupted'
        ? Pause
        : entry.kind === 'agent'
          ? Bot
          : /search|query|搜索/.test(entry.name + entry.label)
            ? Search
            : /url|web|网页|采集/.test(entry.name + entry.label)
              ? Globe
              : /document|file|文档|文件/.test(entry.name + entry.label)
                ? FileText
                : /code|shell|代码/.test(entry.name + entry.label)
                  ? Terminal
                  : Wrench;
  return <Icon size={14} strokeWidth={1.5} />;
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const hasDetails = Boolean(entry.summary || entry.args || entry.action || entry.images?.length);
  const state = activityStateLabel(entry.status);
  const title = (
    <>
      <ActivityIcon entry={entry} />
      <span className="agent-activity-name">
        {entry.label}
        {entry.target && <span className="agent-activity-target"> · {entry.target}</span>}
      </span>
      <span className="agent-activity-state">{state}</span>
      {hasDetails && <ChevronRight size={12} className="agent-disclosure" />}
    </>
  );
  return (
    <details className="agent-activity-row" data-state={entry.status} open={entry.status === 'error' ? true : undefined}>
      <summary>{title}</summary>
      <div className="agent-activity-detail">
        {entry.summary && <p>{entry.summary}</p>}
        {entry.images?.length ? (
          <div className="agent-activity-images">
            {entry.images.map((image, index) => (
              <a href={image.url} target="_blank" rel="noreferrer" key={index}>
                <img src={image.url} alt={image.label || '工具返回画面'} loading="lazy" />
              </a>
            ))}
          </div>
        ) : null}
        {(entry.args || entry.action) && (
          <details className="agent-activity-technical">
            <summary>技术详情</summary>
            {entry.args && <pre>{entry.args}</pre>}
            {entry.action && <pre>{JSON.stringify(entry.action, null, 2)}</pre>}
          </details>
        )}
        {!hasDetails && <p>此步骤没有更多详情。</p>}
      </div>
    </details>
  );
}

export default function AssistantExecution({
  items = [],
  legacy = [],
  thinking,
  task,
  isSending = false,
  active = isSending,
  startedAt,
  message,
  awaitingApproval,
}: Props) {
  const entries = useMemo(() => activityEntries(items, isSending, legacy), [items, legacy, isSending]);
  const reasoning =
    thinking ||
    items
      .filter((item) => item.kind === 'agentReasoning')
      .map((item) => item.content)
      .join('\n\n');
  const failed = executionFailed(entries, task?.status);
  const interrupted = entries.some((entry) => entry.status === 'interrupted') || task?.status === 'cancelled';
  const [expanded, setExpanded] = useState(failed);
  const [mountedAt] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const id = useId();
  useEffect(() => {
    if (failed || !active) setExpanded(failed);
  }, [active, failed]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const current = entries.findLast((entry) => entry.status === 'running');
  const settled = executionSettledLabel(entries, task?.status);
  const label = awaitingApproval
    ? '等待你的确认'
    : active
      ? current
        ? `${current.label}${current.target ? ` · ${current.target}` : ''}…`
        : activityStage(message)
      : current && isSending
        ? `${current.label}${current.target ? ` · ${current.target}` : ''}…`
        : settled;
  const start = startedAt || entries[0]?.startedAt || mountedAt;
  const ends = entries.map((entry) => entry.endedAt).filter((value): value is number => typeof value === 'number');
  const duration =
    start && active
      ? now - start
      : entries.length && entries[0].startedAt && ends.length
        ? Math.max(...ends) - entries[0].startedAt
        : undefined;
  const hasTaskDetails = Boolean(task && (task.totalReferences > 0 || task.deliverable !== 'reply'));
  const hasDetails = Boolean(entries.length || reasoning || hasTaskDetails);
  if (!active && !hasDetails && !failed && !interrupted) return null;
  const summary = (
    <>
      <span className="agent-execution-icon" data-running={active && !awaitingApproval}>
        {active ? (
          <AssistantMark />
        ) : failed ? (
          <AlertCircle size={15} />
        ) : interrupted ? (
          <Pause size={15} />
        ) : entries.length ? (
          <ListChecks size={15} />
        ) : (
          <Check size={15} />
        )}
      </span>
      <span className="agent-execution-label" role={active ? 'status' : undefined}>
        {label}
      </span>
      {duration !== undefined && <time>{formatActivityDuration(duration)}</time>}
      {hasDetails && <ChevronRight size={13} className="agent-disclosure" />}
    </>
  );
  return (
    <div className="agent-execution" data-state={failed ? 'error' : interrupted ? 'interrupted' : active ? 'running' : 'done'}>
      {hasDetails ? (
        <button
          type="button"
          className="agent-execution-summary"
          aria-label={`${label}，${expanded ? '收起' : '展开'}执行记录`}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
        >
          {summary}
        </button>
      ) : (
        <div className="agent-execution-summary">{summary}</div>
      )}
      {expanded && (
        <div id={id} className="agent-execution-steps">
          {entries.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
          {reasoning && <ThinkingBlock content={reasoning} isRunning={active && !current} />}
          {hasTaskDetails && task && <AssistantTaskCard task={task} />}
        </div>
      )}
    </div>
  );
}
