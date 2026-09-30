import { getToolDefinition } from '@shared/domain/assistant/tools/defs';
import { Check, X, Shield } from 'lucide-react';
import type { PendingApproval, ApprovalDecision } from '@client/features/assistant/utils/assistantTurnTypes';

interface Props {
  approval: PendingApproval;
  onDecision: (decision: ApprovalDecision) => void;
  disabled?: boolean;
}

export default function ApprovalCard({ approval, onDecision, disabled }: Props) {
  const canRemember = getToolDefinition(approval.toolName)?.approval === 'per_session';
  const argsPreview = Object.entries(approval.args || {})
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
    .join(' · ');

  return (
    <div data-pending-approval={!disabled ? approval.approvalId : undefined} className="agent-approval-card">
      <div className="flex items-center gap-1.5 font-semibold mb-1.5">
        <Shield className="w-3.5 h-3.5 text-zinc-500" />
        <span>确认操作 · {approval.displayName}</span>
      </div>
      {argsPreview && (
        <div className="text-zinc-500 mb-2 truncate" title={argsPreview}>
          {argsPreview}
        </div>
      )}
      <details className="mb-3"><summary className="cursor-pointer text-zinc-500">查看完整操作参数</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/60 p-2">{JSON.stringify(approval.args, null, 2)}</pre></details>
      <p className="mb-2 text-zinc-500">{canRemember ? '允许仅批准本次操作；本会话允许会在30分钟内批准此工具在当前对话中的后续操作。' : '允许仅批准本次操作，后续操作仍按工具规则确认。'}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDecision('accept')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 text-white text-[11px] font-medium hover:bg-zinc-900 disabled:opacity-50"
        >
          <Check className="w-3 h-3" />
          允许
        </button>
        {canRemember && <button
          type="button"
          disabled={disabled}
          onClick={() => onDecision('acceptForSession')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-700 text-[11px] font-medium hover:bg-zinc-200 disabled:opacity-50"
        >
          本会话允许（30分钟）
        </button>}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDecision('decline')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-zinc-600 text-[11px] font-medium hover:bg-zinc-100 disabled:opacity-50"
        >
          <X className="w-3 h-3" />
          拒绝
        </button>
      </div>
    </div>
  );
}
