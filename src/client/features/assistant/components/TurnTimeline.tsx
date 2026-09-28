import AssistantExecution from './AssistantExecution';
import ApprovalCard from './ApprovalCard';
import type { AssistantTaskState } from '@shared/domain/assistant/taskPolicy';
import type { ToolActivityEntry, PendingApproval, ApprovalDecision } from '../utils/assistantTurnTypes';

interface Props {
  toolActivity: ToolActivityEntry[]; thinking?: string; task?: AssistantTaskState; startedAt?: number;
  streamingStatus?: string; hasReply?: boolean; pendingApprovals: PendingApproval[];
  onApprovalDecision: (approvalId: string, decision: ApprovalDecision) => void; isSending?: boolean;
}
export default function TurnTimeline({ toolActivity, thinking, task, startedAt, streamingStatus, hasReply, pendingApprovals, onApprovalDecision, isSending }: Props) {
  return <div className="agent-turn-content">
    <AssistantExecution legacy={toolActivity} thinking={thinking} task={task} startedAt={startedAt} message={streamingStatus}
      isSending={isSending} active={Boolean(isSending && (!hasReply || toolActivity.some(item => item.status === 'running')))} awaitingApproval={Boolean(isSending && pendingApprovals.length > 0)} />
    {pendingApprovals.map(approval => <ApprovalCard key={approval.approvalId} approval={approval}
      onDecision={decision => onApprovalDecision(approval.approvalId, decision)} disabled={!isSending} />)}
  </div>;
}
