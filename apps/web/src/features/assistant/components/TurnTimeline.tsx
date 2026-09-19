import AssistantToolActivity from '@/features/assistant/components/AssistantToolActivity';
import ThinkingBlock from '@/features/assistant/components/ThinkingBlock';
import ApprovalCard from '@/features/assistant/components/ApprovalCard';
import type { ToolActivityEntry, PendingApproval, ApprovalDecision } from '@/features/assistant/utils/assistantTurnTypes';

interface Props {
  toolActivity: ToolActivityEntry[];
  thinking?: string;
  pendingApprovals: PendingApproval[];
  onApprovalDecision: (approvalId: string, decision: ApprovalDecision) => void;
  isSending?: boolean;
}

export default function TurnTimeline({
  toolActivity,
  thinking,
  pendingApprovals,
  onApprovalDecision,
  isSending,
}: Props) {
  return (
    <div className="space-y-1 w-full">
      {thinking && <ThinkingBlock content={thinking} defaultOpen={false} />}
      {pendingApprovals.map((a) => (
        <ApprovalCard
          key={a.approvalId}
          approval={a}
          onDecision={(d) => onApprovalDecision(a.approvalId, d)}
          disabled={!isSending}
        />
      ))}
      {toolActivity.length > 0 && <AssistantToolActivity items={toolActivity} />}
    </div>
  );
}
