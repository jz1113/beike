import type { AssistantTaskState } from '@shared/domain/assistant/taskPolicy';
import { proxyMediaUrl } from '@client/shared/api/apiClient';

/** Supplemental reference context, shown only inside the execution disclosure. */
export default function AssistantTaskCard({ task }: { task: AssistantTaskState }) {
  return <details className="agent-task-context" data-testid="assistant-task-card">
    <summary>任务与参考{task.references.length > 0 ? ` · ${task.references.length} 张图片` : ''}</summary>
    <p>{task.goal}</p>
    {task.totalReferences > 0 && <p>本轮引用 {task.references.length} / {task.totalReferences} 张{task.referenceScope === 'sample' ? ' · 按来源抽样，不代表已看完图集' : task.referenceScope === 'explicit' ? ' · 用户指定编号' : ''}</p>}
    {task.references.length > 0 && <div className="agent-activity-images">{task.references.map(ref => <a key={ref.number} href={proxyMediaUrl(ref.url)} target="_blank" rel="noreferrer" title={`${ref.label} · @图片${ref.number}`}><img src={proxyMediaUrl(ref.url)} alt={`@图片${ref.number} ${ref.label}`} /></a>)}</div>}
  </details>;
}
