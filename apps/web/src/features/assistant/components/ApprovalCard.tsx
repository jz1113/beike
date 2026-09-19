import { Check, X, Shield } from 'lucide-react';
import type { PendingApproval, ApprovalDecision } from '@/features/assistant/utils/assistantTurnTypes';

interface Props {
  approval: PendingApproval;
  onDecision: (decision: ApprovalDecision) => void;
  disabled?: boolean;
}

export default function ApprovalCard({ approval, onDecision, disabled }: Props) {
  const argsPreview = Object.entries(approval.args || {})
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
    .join(' · ');

  return (
    <div className="w-full rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-[11px] text-amber-900 mb-2">
      <div className="flex items-center gap-1.5 font-semibold mb-1.5">
        <Shield className="w-3.5 h-3.5 text-amber-600" />
        <span>需要您的确认：{approval.displayName}</span>
      </div>
      {argsPreview && (
        <div className="text-amber-700/80 mb-2 truncate" title={argsPreview}>
          {argsPreview}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDecision('accept')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="w-3 h-3" />
          允许
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDecision('acceptForSession')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          本会话允许
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onDecision('decline')}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-800 text-[11px] font-medium hover:bg-amber-100 disabled:opacity-50"
        >
          <X className="w-3 h-3" />
          拒绝
        </button>
      </div>
    </div>
  );
}
