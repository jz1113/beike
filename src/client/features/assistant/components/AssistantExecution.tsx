import { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, Bot, Check, ChevronRight, FileText, Globe, ListChecks, Pause, Search, Terminal, Wrench } from 'lucide-react';
import type { AssistantItem } from '@shared/domain/assistant/types';
import type { AssistantTaskState } from '@shared/domain/assistant/taskPolicy';
import type { ToolActivityEntry } from '../model/assistantTurnTypes';
import { activityEntries, activityStage, formatActivityDuration, type ActivityEntry } from '../model/assistantActivity';
import AssistantMark from './AssistantMark';
import ThinkingBlock from './ThinkingBlock';
import AssistantTaskCard from './AssistantTaskCard';

interface Props {
  items?: AssistantItem[]; legacy?: ToolActivityEntry[]; thinking?: string; task?: AssistantTaskState;
  isSending?: boolean; active?: boolean; startedAt?: number; message?: string; awaitingApproval?: boolean;
}
function ActivityIcon({ entry }: { entry: ActivityEntry }) {
  const Icon = entry.status === 'error' ? AlertCircle : entry.status === 'interrupted' ? Pause : entry.kind === 'agent' ? Bot
    : /search|query|搜索/.test(entry.name + entry.label) ? Search : /url|web|网页|采集/.test(entry.name + entry.label) ? Globe
    : /document|file|文档|文件/.test(entry.name + entry.label) ? FileText : /code|shell|代码/.test(entry.name + entry.label) ? Terminal : Wrench;
  return <Icon size={14} strokeWidth={1.5} />;
}
function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const hasDetails = Boolean(entry.summary || entry.args || entry.action || entry.images?.length);
  const state = entry.status === 'running' ? '进行中' : entry.status === 'error' ? '失败' : entry.status === 'interrupted' ? '已中断' : '已完成';
  const title = <><ActivityIcon entry={entry} /><span className="agent-activity-name">{entry.label}{entry.target && <span className="agent-activity-target"> · {entry.target}</span>}</span><span className="agent-activity-state">{state}</span>{hasDetails && <ChevronRight size={12} className="agent-disclosure" />}</>;
  return <details className="agent-activity-row" data-state={entry.status} open={entry.status === 'error' ? true : undefined}>
    <summary>{title}</summary>
    <div className="agent-activity-detail">
      {entry.summary && <p>{entry.summary}</p>}
      {entry.images?.length ? <div className="agent-activity-images">{entry.images.map((image, index) => <a href={image.url} target="_blank" rel="noreferrer" key={index}><img src={image.url} alt={image.label || '工具返回画面'} loading="lazy" /></a>)}</div> : null}
      {(entry.args || entry.action) && <details className="agent-activity-technical"><summary>技术详情</summary>{entry.args && <pre>{entry.args}</pre>}{entry.action && <pre>{JSON.stringify(entry.action, null, 2)}</pre>}</details>}
      {!hasDetails && <p>此步骤没有更多详情。</p>}
    </div>
  </details>;
}
export default function AssistantExecution({ items = [], legacy = [], thinking, task, isSending = false, active = isSending, startedAt, message, awaitingApproval }: Props) {
  const entries = useMemo(() => activityEntries(items, isSending, legacy), [items, legacy, isSending]);
  const reasoning = thinking || items.filter(item => item.kind === 'agentReasoning').map(item => item.content).join('\n\n');
  const failed = entries.some(entry => entry.status === 'error') || task?.status === 'failed';
  const interrupted = entries.some(entry => entry.status === 'interrupted') || task?.status === 'cancelled';
  const [expanded, setExpanded] = useState(failed);
  const [mountedAt] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const id = useId();
  useEffect(() => { if (failed || !active) setExpanded(failed); }, [active, failed]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const current = entries.findLast(entry => entry.status === 'running');
  const completed = entries.filter(entry => entry.status === 'done').length;
  const label = awaitingApproval ? '等待你的确认' : active ? current ? `${current.label}${current.target ? ` · ${current.target}` : ''}…` : activityStage(message)
    : current && isSending ? `${current.label}${current.target ? ` · ${current.target}` : ''}…` : failed ? `${completed ? `已完成 ${completed} 个操作，` : ''}有步骤失败` : interrupted ? '执行已中断'
    : entries.length ? `已完成 ${completed} 个操作` : '已思考';
  const start = startedAt || entries[0]?.startedAt || mountedAt;
  const ends = entries.map(entry => entry.endedAt).filter((value): value is number => typeof value === 'number');
  const duration = start && active ? now - start : entries.length && entries[0].startedAt && ends.length ? Math.max(...ends) - entries[0].startedAt : undefined;
  const hasTaskDetails = Boolean(task && (task.totalReferences > 0 || task.deliverable !== 'reply'));
  const hasDetails = Boolean(entries.length || reasoning || hasTaskDetails);
  if (!active && !hasDetails && !failed && !interrupted) return null;
  const summary = <><span className="agent-execution-icon" data-running={active && !awaitingApproval}>{active ? <AssistantMark /> : failed ? <AlertCircle size={15} /> : interrupted ? <Pause size={15} /> : entries.length ? <ListChecks size={15} /> : <Check size={15} />}</span><span className="agent-execution-label" role={active ? 'status' : undefined}>{label}</span>{duration !== undefined && <time>{formatActivityDuration(duration)}</time>}{hasDetails && <ChevronRight size={13} className="agent-disclosure" />}</>;
  return <div className="agent-execution" data-state={failed ? 'error' : interrupted ? 'interrupted' : active ? 'running' : 'done'}>
    {hasDetails ? <button type="button" className="agent-execution-summary" aria-label={`${label}，${expanded ? '收起' : '展开'}执行记录`} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{summary}</button> : <div className="agent-execution-summary">{summary}</div>}
    {expanded && <div id={id} className="agent-execution-steps">
      {entries.map(entry => <ActivityRow key={entry.id} entry={entry} />)}
      {reasoning && <ThinkingBlock content={reasoning} isRunning={active && !current} />}
      {hasTaskDetails && task && <AssistantTaskCard task={task} />}
    </div>}
  </div>;
}
